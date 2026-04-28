package com.secretbox.auth.service;

import com.secretbox.auth.dto.LoginRequest;
import com.secretbox.auth.dto.LoginResponse;
import com.secretbox.auth.dto.PreLoginRequest;
import com.secretbox.auth.dto.PreLoginResponse;
import com.secretbox.auth.dto.RefreshResponse;
import com.secretbox.auth.dto.RegisterRequest;
import com.secretbox.auth.dto.RegisterResponse;
import com.secretbox.audit.domain.AuditAction;
import com.secretbox.audit.service.AuditLogService;
import com.secretbox.common.exception.ApiException;
import com.secretbox.user.domain.User;
import com.secretbox.user.repository.UserRepository;
import com.secretbox.user.service.TwoFactorService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final TwoFactorService twoFactorService;
    private final LoginAttemptService loginAttemptService;
    private final AuditLogService auditLog;
    private final Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id);

    @Value("${app.security.kdf.min-iterations}")
    private int minIterations;

    @Value("${app.security.kdf.min-memory-kb}")
    private int minMemoryKb;

    @Value("${app.security.kdf.min-parallelism}")
    private int minParallelism;

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    private static final int SERVER_ARGON2_ITERATIONS = 3;
    private static final int SERVER_ARGON2_MEMORY_KB = 65536;
    private static final int SERVER_ARGON2_PARALLELISM = 4;

    private static final int DUMMY_SALT_LENGTH = 16;

    // ==========================================================
    // Register
    // ==========================================================

    @Transactional
    public RegisterResponse register(RegisterRequest req, String userAgent, String ipAddress) {
        validateKdfParams(req);

        if (userRepository.existsByEmail(req.email())) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS",
                "이미 가입된 이메일입니다");
        }

        String storedAuthHash = argon2.hash(
            SERVER_ARGON2_ITERATIONS,
            SERVER_ARGON2_MEMORY_KB,
            SERVER_ARGON2_PARALLELISM,
            req.authHash().toCharArray()
        );

        User user = User.builder()
            .email(req.email())
            .authHash(storedAuthHash)
            .kdfSalt(decodeBase64(req.kdfSalt(), "kdfSalt"))
            .kdfIterations(req.kdfIterations())
            .kdfMemoryKb(req.kdfMemoryKb())
            .kdfParallelism(req.kdfParallelism())
            .protectedDek(decodeBase64(req.protectedDek(), "protectedDek"))
            .protectedDekIv(decodeBase64(req.protectedDekIv(), "protectedDekIv"))
            .recoveryHash(req.recoveryCodeHash())
            .twoFactorEnabled(false)
            .build();

        User saved = userRepository.save(user);
        log.info("User registered: id={}, email={}", saved.getId(), saved.getEmail());
        auditLog.log(saved.getId(), AuditAction.REGISTER, ipAddress, userAgent);

        return new RegisterResponse(
            saved.getId(),
            saved.getEmail(),
            "가입이 완료되었습니다."
        );
    }

    private void validateKdfParams(RegisterRequest req) {
        if (req.kdfIterations() < minIterations
            || req.kdfMemoryKb() < minMemoryKb
            || req.kdfParallelism() < minParallelism) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_KDF_PARAMS",
                "KDF 파라미터가 최소 요구 사양보다 약합니다");
        }
    }

    // ==========================================================
    // Pre-login: KDF 파라미터 응답
    // 이메일 존재 여부를 노출하지 않으려면 미가입 이메일에도 deterministic dummy salt를 줘야 한다.
    // ==========================================================

    public PreLoginResponse preLogin(PreLoginRequest req) {
        return userRepository.findByEmail(req.email())
            .map(user -> new PreLoginResponse(
                Base64.getEncoder().encodeToString(user.getKdfSalt()),
                user.getKdfIterations(),
                user.getKdfMemoryKb(),
                user.getKdfParallelism()
            ))
            .orElseGet(() -> new PreLoginResponse(
                Base64.getEncoder().encodeToString(generateDummySalt(req.email())),
                SERVER_ARGON2_ITERATIONS,
                SERVER_ARGON2_MEMORY_KB,
                SERVER_ARGON2_PARALLELISM
            ));
    }

    private byte[] generateDummySalt(String email) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] full = mac.doFinal(email.toLowerCase().getBytes(StandardCharsets.UTF_8));
            return Arrays.copyOf(full, DUMMY_SALT_LENGTH);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC 초기화 실패", e);
        }
    }

    // ==========================================================
    // Login: authHash 검증 + JWT 발급
    // ==========================================================

    @Transactional
    public LoginResponse login(LoginRequest req, String userAgent, String ipAddress, String deviceId) {
        User user = userRepository.findByEmail(req.email())
            .orElseThrow(() -> invalidCredentials());

        rejectIfLocked(user);

        boolean valid;
        try {
            valid = argon2.verify(user.getAuthHash(), req.authHash().toCharArray());
        } catch (Exception e) {
            log.warn("Argon2 verify failed for email={}: {}", req.email(), e.getMessage());
            valid = false;
        }

        if (!valid) {
            int newCount = loginAttemptService.recordFailure(user.getId(), ipAddress, userAgent);
            int remaining = LoginAttemptService.LOCKOUT_THRESHOLD - newCount;
            if (remaining <= 0) {
                long minutes = LoginAttemptService.LOCKOUT_DURATION.toMinutes();
                throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_LOCKED",
                    "연속 실패로 계정이 " + minutes + "분간 잠겼습니다.\n잠시 후 다시 시도해주세요.");
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                "이메일 또는 비밀번호가 올바르지 않습니다.\n(남은 시도: " + remaining + "회)");
        }

        loginAttemptService.resetFailures(user.getId());

        if (user.isTwoFactorEnabled() && user.getTotpSecret() != null) {
            String token = jwtService.issueTwoFactorToken(user.getId());
            log.info("2FA required for login: user={}", user.getId());
            return LoginResponse.twoFactorRequired(token);
        }

        auditLog.log(user.getId(), AuditAction.LOGIN_SUCCESS, ipAddress, userAgent);
        return issueFullSession(user, userAgent, ipAddress, deviceId, false);
    }

    private void rejectIfLocked(User user) {
        Instant lockedUntil = user.getLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(Instant.now())) {
            long secondsLeft = Duration.between(Instant.now(), lockedUntil).getSeconds();
            throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_LOCKED",
                "연속 실패로 계정이 잠겼습니다.\n" + (secondsLeft / 60 + 1) + "분 후 다시 시도해주세요.");
        }
    }


    /**
     * 2FA 2단계 — twoFactorToken 검증 + TOTP/recovery 코드 검증 → 풀 세션 발급.
     * recovery code로 통과 시 응답에 recoveryUsed=true 표시 (2FA는 이미 폐기된 상태).
     */
    @Transactional
    public LoginResponse loginTwoFactor(String twoFactorToken, String code,
                                        String userAgent, String ipAddress, String deviceId) {
        UUID userId = parseTwoFactorToken(twoFactorToken);
        User user = userRepository.findById(userId).orElseThrow(this::invalidCredentials);

        var verify = twoFactorService.verifyForLogin(userId, code);
        if (!verify.ok()) {
            auditLog.log(userId, AuditAction.LOGIN_2FA_FAIL, ipAddress, userAgent);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOTP_CODE",
                "코드가 올바르지 않습니다");
        }

        auditLog.log(userId, AuditAction.LOGIN_2FA_SUCCESS, ipAddress, userAgent);
        if (verify.recoveryUsed()) {
            auditLog.log(userId, AuditAction.RECOVERY_USED, ipAddress, userAgent);
        }
        return issueFullSession(user, userAgent, ipAddress, deviceId, verify.recoveryUsed());
    }

    private UUID parseTwoFactorToken(String token) {
        try {
            Claims claims = jwtService.parse(token);
            String purpose = claims.get("purpose", String.class);
            if (!"2fa".equals(purpose)) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_2FA_TOKEN",
                    "잘못된 토큰입니다");
            }
            return UUID.fromString(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_2FA_TOKEN",
                "토큰이 만료됐거나 잘못됐습니다. 처음부터 다시 시도해주세요");
        }
    }

    private LoginResponse issueFullSession(User user, String userAgent, String ipAddress,
                                           String deviceId, boolean recoveryUsed) {
        String accessToken = jwtService.issueAccessToken(user.getId(), user.getEmail());
        String refreshToken = refreshTokenService.issue(user.getId(), userAgent, ipAddress, deviceId);
        log.info("User logged in: id={}, email={}, device={}", user.getId(), user.getEmail(), deviceId);
        return LoginResponse.fullSession(
            accessToken,
            refreshToken,
            Base64.getEncoder().encodeToString(user.getProtectedDek()),
            Base64.getEncoder().encodeToString(user.getProtectedDekIv()),
            new LoginResponse.UserSummary(user.getId(), user.getEmail()),
            recoveryUsed
        );
    }

    @Transactional
    public RefreshResponse refresh(String refreshToken, String userAgent, String ipAddress) {
        var rotated = refreshTokenService.rotate(refreshToken, userAgent, ipAddress);
        User user = userRepository.findById(rotated.userId())
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,
                "INVALID_REFRESH_TOKEN", "다시 로그인해주세요"));
        String newAccess = jwtService.issueAccessToken(user.getId(), user.getEmail());
        return new RefreshResponse(newAccess, rotated.newRefreshToken());
    }

    @Transactional
    public void logout(String refreshToken, String ipAddress, String userAgent) {
        UUID userId = refreshTokenService.revokeAndReturnUserId(refreshToken);
        if (userId != null) {
            auditLog.log(userId, AuditAction.LOGOUT, ipAddress, userAgent);
        }
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
            "이메일 또는 비밀번호가 올바르지 않습니다");
    }

    // ==========================================================
    // Helpers
    // ==========================================================

    private byte[] decodeBase64(String value, String fieldName) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BASE64",
                fieldName + " 필드의 base64 디코딩 실패");
        }
    }
}
