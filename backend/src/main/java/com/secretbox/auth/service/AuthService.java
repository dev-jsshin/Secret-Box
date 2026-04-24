package com.secretbox.auth.service;

import com.secretbox.auth.dto.LoginRequest;
import com.secretbox.auth.dto.LoginResponse;
import com.secretbox.auth.dto.PreLoginRequest;
import com.secretbox.auth.dto.PreLoginResponse;
import com.secretbox.auth.dto.RefreshResponse;
import com.secretbox.auth.dto.RegisterRequest;
import com.secretbox.auth.dto.RegisterResponse;
import com.secretbox.common.exception.ApiException;
import com.secretbox.user.domain.User;
import com.secretbox.user.repository.UserRepository;
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
import java.util.Arrays;
import java.util.Base64;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
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
    public RegisterResponse register(RegisterRequest req) {
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
            .twoFactorEnabled(true)
            .build();

        User saved = userRepository.save(user);
        log.info("User registered: id={}, email={}", saved.getId(), saved.getEmail());

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

        boolean valid;
        try {
            valid = argon2.verify(user.getAuthHash(), req.authHash().toCharArray());
        } catch (Exception e) {
            log.warn("Argon2 verify failed for email={}: {}", req.email(), e.getMessage());
            valid = false;
        }

        if (!valid) {
            throw invalidCredentials();
        }

        String accessToken = jwtService.issueAccessToken(user.getId(), user.getEmail());
        String refreshToken = refreshTokenService.issue(user.getId(), userAgent, ipAddress, deviceId);
        log.info("User logged in: id={}, email={}, device={}", user.getId(), user.getEmail(), deviceId);

        return new LoginResponse(
            accessToken,
            refreshToken,
            Base64.getEncoder().encodeToString(user.getProtectedDek()),
            Base64.getEncoder().encodeToString(user.getProtectedDekIv()),
            new LoginResponse.UserSummary(user.getId(), user.getEmail())
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
    public void logout(String refreshToken) {
        refreshTokenService.revoke(refreshToken);
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
