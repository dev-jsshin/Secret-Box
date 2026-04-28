package com.secretbox.audit.service;

import com.secretbox.audit.domain.AuditLog;
import com.secretbox.audit.dto.AuditLogDto;
import com.secretbox.audit.dto.AuditLogPageResponse;
import com.secretbox.audit.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * 감사 로그 기록. 비동기 + 에러 격리 — 로깅 실패가 본 액션 실패로 이어지지 않게 한다.
 *
 * 호출 시점:
 *   - 인증/세션 변경 (AuthService, UserService)
 *   - 항목 변경 (VaultService)
 *   - 보안 이벤트 (계정 잠금)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository repository;

    @Async
    public void log(UUID userId, String action, String targetType, String targetId,
                    String ipAddress, String userAgent) {
        try {
            repository.save(AuditLog.builder()
                .userId(userId)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build());
        } catch (Exception e) {
            // 로깅 실패는 응용 흐름을 막지 않는다 — 운영 알림용 warn만
            log.warn("Audit log write failed: action={}, user={}, err={}", action, userId, e.getMessage());
        }
    }

    /** 단순 액션 (대상 없음) */
    public void log(UUID userId, String action, String ipAddress, String userAgent) {
        log(userId, action, null, null, ipAddress, userAgent);
    }

    /** 본인 활동 로그 페이지 조회. page는 0부터, size는 50으로 캡. */
    public AuditLogPageResponse listForUser(UUID userId, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 50);
        Page<AuditLog> result = repository.findByUserIdOrderByCreatedAtDesc(
            userId, PageRequest.of(safePage, safeSize));

        var dtos = result.getContent().stream()
            .map(a -> new AuditLogDto(
                a.getId(), a.getAction(), a.getTargetType(), a.getTargetId(),
                a.getIpAddress(), a.getUserAgent(), a.getCreatedAt()))
            .toList();

        return new AuditLogPageResponse(
            dtos,
            result.getNumber(),
            result.getSize(),
            result.getTotalElements(),
            result.hasNext()
        );
    }
}
