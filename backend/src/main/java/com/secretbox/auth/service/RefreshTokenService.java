package com.secretbox.auth.service;

import com.secretbox.auth.domain.Session;
import com.secretbox.auth.repository.SessionRepository;
import com.secretbox.common.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

/**
 * Refresh token = 32바이트 랜덤 opaque 문자열.
 * DB에는 SHA-256 해시만 저장 (탈취 시 토큰 자체는 못 알아내게).
 * Refresh 시 회전(rotation) — 이전 토큰 폐기 + 새 토큰 발급.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final SessionRepository sessionRepository;

    @Value("${app.jwt.refresh-ttl-days}")
    private long refreshTtlDays;

    /** 새 refresh token 발급 + sessions 테이블에 hash 저장. raw 토큰 반환 (한 번만). */
    @Transactional
    public String issue(UUID userId, String userAgent, String ipAddress) {
        String rawToken = generateRawToken();
        String hash = sha256(rawToken);

        Instant expiresAt = Instant.now().plus(refreshTtlDays, ChronoUnit.DAYS);

        sessionRepository.save(Session.builder()
            .userId(userId)
            .refreshTokenHash(hash)
            .userAgent(userAgent)
            .ipAddress(ipAddress)
            .expiresAt(expiresAt)
            .build());

        return rawToken;
    }

    /** Refresh 회전: 기존 토큰 검증 + revoke + 새 토큰 발급. 새 raw 토큰 반환. */
    @Transactional
    public RotatedSession rotate(String rawToken, String userAgent, String ipAddress) {
        Session session = findValid(rawToken);

        // 회전: 기존 세션 revoke
        session.setRevokedAt(Instant.now());

        // 새 세션 발급
        UUID userId = session.getUserId();
        String newRaw = issue(userId, userAgent, ipAddress);

        return new RotatedSession(userId, newRaw);
    }

    @Transactional
    public void revoke(String rawToken) {
        sessionRepository.findByRefreshTokenHash(sha256(rawToken))
            .ifPresent(session -> session.setRevokedAt(Instant.now()));
    }

    private Session findValid(String rawToken) {
        Session session = sessionRepository.findByRefreshTokenHash(sha256(rawToken))
            .orElseThrow(() -> invalid());

        if (session.getRevokedAt() != null) throw invalid();
        if (session.getExpiresAt().isBefore(Instant.now())) throw invalid();

        return session;
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN",
            "다시 로그인해주세요");
    }

    private static String generateRawToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    public record RotatedSession(UUID userId, String newRefreshToken) {}
}
