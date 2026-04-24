package com.secretbox.user.service;

import com.secretbox.auth.repository.SessionRepository;
import com.secretbox.auth.service.JwtService;
import com.secretbox.auth.service.RefreshTokenService;
import com.secretbox.common.exception.ApiException;
import com.secretbox.auth.domain.Session;
import com.secretbox.user.domain.User;
import com.secretbox.user.dto.ChangePasswordRequest;
import com.secretbox.user.dto.ChangePasswordResponse;
import com.secretbox.user.dto.SessionListItem;
import com.secretbox.user.dto.SessionListResponse;
import com.secretbox.user.repository.UserRepository;
import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id);

    @Value("${app.security.kdf.min-iterations}")
    private int minIterations;

    @Value("${app.security.kdf.min-memory-kb}")
    private int minMemoryKb;

    @Value("${app.security.kdf.min-parallelism}")
    private int minParallelism;

    private static final int SERVER_ARGON2_ITERATIONS = 3;
    private static final int SERVER_ARGON2_MEMORY_KB = 65536;
    private static final int SERVER_ARGON2_PARALLELISM = 4;

    /**
     * 마스터 비밀번호 변경.
     * 클라이언트가 새 KEK로 기존 DEK를 다시 감싸서 newProtectedDek로 보낸다.
     * 항목들은 DEK가 안 바뀌므로 재암호화 불필요.
     * 다른 모든 세션은 강제 로그아웃 (현재 요청용 새 access/refresh를 응답으로 반환).
     */
    @Transactional
    public ChangePasswordResponse changePassword(
        UUID userId,
        ChangePasswordRequest req,
        String userAgent,
        String ipAddress,
        String deviceId
    ) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,
                "INVALID_CREDENTIALS", "사용자를 찾을 수 없습니다"));

        // 1) 현재 비밀번호 검증
        boolean valid;
        try {
            valid = argon2.verify(user.getAuthHash(), req.oldAuthHash().toCharArray());
        } catch (Exception e) {
            valid = false;
        }
        if (!valid) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_OLD_PASSWORD",
                "현재 비밀번호가 올바르지 않습니다");
        }

        // 2) 새 KDF 파라미터 검증
        if (req.newKdfIterations() < minIterations
            || req.newKdfMemoryKb() < minMemoryKb
            || req.newKdfParallelism() < minParallelism) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_KDF_PARAMS",
                "KDF 파라미터가 최소 요구 사양보다 약합니다");
        }

        // 3) 새 authHash를 서버 측에서 한 번 더 Argon2로 해시
        String newStoredHash = argon2.hash(
            SERVER_ARGON2_ITERATIONS,
            SERVER_ARGON2_MEMORY_KB,
            SERVER_ARGON2_PARALLELISM,
            req.newAuthHash().toCharArray()
        );

        // 4) 사용자 레코드 갱신
        user.setAuthHash(newStoredHash);
        user.setKdfSalt(decodeBase64(req.newKdfSalt(), "newKdfSalt"));
        user.setKdfIterations(req.newKdfIterations());
        user.setKdfMemoryKb(req.newKdfMemoryKb());
        user.setKdfParallelism(req.newKdfParallelism());
        user.setProtectedDek(decodeBase64(req.newProtectedDek(), "newProtectedDek"));
        user.setProtectedDekIv(decodeBase64(req.newProtectedDekIv(), "newProtectedDekIv"));

        // 5) 모든 기존 세션 폐기
        int revoked = sessionRepository.revokeAllForUser(userId, Instant.now());
        log.info("Master password changed: user={}, sessions revoked={}", userId, revoked);

        // 6) 현재 요청을 위한 새 access + refresh 발급
        String accessToken = jwtService.issueAccessToken(userId, user.getEmail());
        String refreshToken = refreshTokenService.issue(userId, userAgent, ipAddress, deviceId);

        return new ChangePasswordResponse(accessToken, refreshToken,
            "마스터 비밀번호가 변경되었습니다. 다른 기기는 모두 로그아웃됐어요.");
    }

    /**
     * 활성 세션 목록 조회. currentRawRefreshToken이 있으면 매칭되는 세션은 current=true로 표시한다.
     */
    public SessionListResponse listSessions(UUID userId, String currentRawRefreshToken) {
        String currentHash = currentRawRefreshToken != null && !currentRawRefreshToken.isBlank()
            ? refreshTokenService.hashOf(currentRawRefreshToken)
            : null;

        List<SessionListItem> items = sessionRepository
            .findByUserIdAndRevokedAtIsNullOrderByLastSeenAtDesc(userId).stream()
            .map(s -> new SessionListItem(
                s.getId().toString(),
                s.getUserAgent(),
                s.getIpAddress(),
                s.getCreatedAt(),
                s.getLastSeenAt(),
                s.getExpiresAt(),
                currentHash != null && currentHash.equals(s.getRefreshTokenHash())
            ))
            .toList();

        return new SessionListResponse(items);
    }

    /** 특정 세션 폐기. 본인 소유가 아니면 403. */
    @Transactional
    public void revokeSession(UUID userId, UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND",
                "세션을 찾을 수 없습니다"));

        if (!session.getUserId().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                "본인 세션이 아닙니다");
        }

        if (session.getRevokedAt() == null) {
            session.setRevokedAt(Instant.now());
            log.info("Session revoked: user={}, session={}", userId, sessionId);
        }
    }

    /** 현재 세션을 제외한 모든 활성 세션 폐기. */
    @Transactional
    public int revokeOtherSessions(UUID userId, String currentRawRefreshToken) {
        String currentHash = refreshTokenService.hashOf(currentRawRefreshToken);
        List<Session> sessions = sessionRepository
            .findByUserIdAndRevokedAtIsNullOrderByLastSeenAtDesc(userId);

        Instant now = Instant.now();
        int count = 0;
        for (Session s : sessions) {
            if (!currentHash.equals(s.getRefreshTokenHash())) {
                s.setRevokedAt(now);
                count++;
            }
        }
        log.info("Other sessions revoked: user={}, count={}", userId, count);
        return count;
    }

    private byte[] decodeBase64(String value, String fieldName) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BASE64",
                fieldName + " 필드의 base64 디코딩 실패");
        }
    }
}
