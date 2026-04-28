package com.secretbox.auth.service;

import com.secretbox.audit.domain.AuditAction;
import com.secretbox.audit.service.AuditLogService;
import com.secretbox.user.domain.User;
import com.secretbox.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * 로그인 실패 카운터 / 자동 잠금 추적.
 *
 * 별도 서비스로 분리한 이유: AuthService.login()의 트랜잭션이 ApiException으로
 * 롤백될 때 실패 카운터 증가까지 같이 사라지지 않도록 — 여기서 REQUIRES_NEW로
 * 별도 트랜잭션을 열어 즉시 커밋한 뒤 caller가 throw해도 카운터는 보존된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginAttemptService {

    public static final int LOCKOUT_THRESHOLD = 5;
    public static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);

    private final UserRepository userRepository;
    private final AuditLogService auditLog;

    /**
     * 실패 1회 기록. 임계치 도달 시 잠금까지. 새 카운트 반환.
     * REQUIRES_NEW로 caller 트랜잭션과 격리 → caller가 throw해도 이 변경은 살아남는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int recordFailure(UUID userId, String ipAddress, String userAgent) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return 0;

        int next = user.getFailedLoginCount() + 1;
        user.setFailedLoginCount(next);
        auditLog.log(userId, AuditAction.LOGIN_FAIL, ipAddress, userAgent);

        if (next >= LOCKOUT_THRESHOLD) {
            user.setLockedUntil(Instant.now().plus(LOCKOUT_DURATION));
            log.warn("Account locked due to repeated failures: user={}, until={}",
                userId, user.getLockedUntil());
            auditLog.log(userId, AuditAction.ACCOUNT_LOCKED, ipAddress, userAgent);
        }
        return next;
    }

    /** 성공 시 카운터 리셋. 보통 caller 트랜잭션 안에서 호출돼도 무방하지만 일관성 위해 REQUIRES_NEW. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void resetFailures(UUID userId) {
        userRepository.findById(userId).ifPresent(user -> {
            if (user.getFailedLoginCount() > 0 || user.getLockedUntil() != null) {
                user.setFailedLoginCount(0);
                user.setLockedUntil(null);
            }
        });
    }
}
