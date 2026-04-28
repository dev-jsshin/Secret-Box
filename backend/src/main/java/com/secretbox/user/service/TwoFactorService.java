package com.secretbox.user.service;

import com.secretbox.audit.domain.AuditAction;
import com.secretbox.audit.service.AuditLogService;
import com.secretbox.auth.service.TotpCodec;
import com.secretbox.common.exception.ApiException;
import com.secretbox.user.domain.User;
import com.secretbox.user.dto.TwoFactorEnableConfirmResponse;
import com.secretbox.user.dto.TwoFactorInitResponse;
import com.secretbox.user.dto.TwoFactorStatusResponse;
import com.secretbox.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 마스터 로그인용 TOTP 2FA + 단일 recovery code (kill switch 모델).
 *
 *   enroll:    init (secret 생성, pending) → confirm (두 연속 코드 검증 → 활성화 + 1개 recovery 발급)
 *   disable:   TOTP 또는 recovery code로 본인 확인 → 모든 자료 폐기
 *   login 검증: TOTP 코드 통과 OR recovery 사용 (recovery 사용 시 2FA 자동 비활성화)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TwoFactorService {

    private static final String ISSUER = "SecretBox.app";

    private final UserRepository userRepository;
    private final TotpCodec totpCodec;
    private final AuditLogService auditLog;

    public TwoFactorStatusResponse status(UUID userId) {
        User user = mustFindUser(userId);
        return new TwoFactorStatusResponse(user.isTwoFactorEnabled());
    }

    @Transactional
    public TwoFactorInitResponse initEnable(UUID userId) {
        User user = mustFindUser(userId);
        if (user.isTwoFactorEnabled()) {
            throw new ApiException(HttpStatus.CONFLICT, "TOTP_ALREADY_ENABLED",
                "2FA가 이미 활성화되어 있습니다");
        }
        String secret = totpCodec.generateSecret();
        user.setTotpSecret(secret);
        user.setTotpRecoveryHash(null);
        log.info("2FA init pending: user={}", userId);
        return new TwoFactorInitResponse(secret, totpCodec.otpauthUri(secret, user.getEmail(), ISSUER));
    }

    @Transactional
    public TwoFactorEnableConfirmResponse confirmEnable(UUID userId, String code1, String code2) {
        User user = mustFindUser(userId);
        if (user.isTwoFactorEnabled()) {
            throw new ApiException(HttpStatus.CONFLICT, "TOTP_ALREADY_ENABLED",
                "2FA가 이미 활성화되어 있습니다");
        }
        if (user.getTotpSecret() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TOTP_NOT_INITIATED",
                "먼저 2FA 등록을 시작해주세요");
        }

        long now = totpCodec.currentCounter();
        boolean validPair = false;
        for (long start = now - 1; start <= now + 1; start++) {
            if (totpCodec.verifyAtCounter(user.getTotpSecret(), code1, start)
                && totpCodec.verifyAtCounter(user.getTotpSecret(), code2, start + 1)) {
                validPair = true;
                break;
            }
        }
        if (!validPair) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOTP_CODE",
                "코드가 올바르지 않습니다. 두 코드는 연속해서 입력해야 하며 두 번째 코드는 30초 후 새로 갱신된 값이어야 합니다");
        }

        String rawRecovery = totpCodec.generateLongRecoveryCode();
        user.setTotpRecoveryHash(totpCodec.hashRecoveryCode(rawRecovery));
        user.setTwoFactorEnabled(true);
        log.info("2FA enabled: user={}", userId);
        auditLog.log(userId, AuditAction.TOTP_ENABLED, null, null);
        return new TwoFactorEnableConfirmResponse(rawRecovery);
    }

    @Transactional
    public void disable(UUID userId, String code) {
        User user = mustFindUser(userId);
        if (!user.isTwoFactorEnabled() || user.getTotpSecret() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TOTP_NOT_ENABLED",
                "2FA가 활성화되어 있지 않습니다");
        }
        boolean ok = totpCodec.verify(user.getTotpSecret(), code) || matchesRecovery(user, code);
        if (!ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOTP_CODE",
                "코드가 올바르지 않습니다");
        }
        clearTwoFactor(user);
        log.info("2FA disabled: user={}", userId);
        auditLog.log(userId, AuditAction.TOTP_DISABLED, null, null);
    }

    /**
     * 로그인 흐름에서 2FA 코드 검증.
     *   - TOTP 통과 → ok, recovery 사용 안 됨
     *   - recovery 매치 → ok + 사용 표시 → 호출자가 사용자에게 알림 (서버는 2FA 폐기 처리)
     *   - 둘 다 실패 → ok=false
     */
    @Transactional
    public VerifyResult verifyForLogin(UUID userId, String code) {
        User user = mustFindUser(userId);
        if (!user.isTwoFactorEnabled() || user.getTotpSecret() == null) {
            return new VerifyResult(true, false);
        }
        if (totpCodec.verify(user.getTotpSecret(), code)) {
            return new VerifyResult(true, false);
        }
        if (matchesRecovery(user, code)) {
            // kill switch — 사용 즉시 2FA 폐기. 사용자는 다시 enroll 해야 함.
            clearTwoFactor(user);
            log.info("Recovery code used — 2FA disabled: user={}", userId);
            return new VerifyResult(true, true);
        }
        return new VerifyResult(false, false);
    }

    private boolean matchesRecovery(User user, String code) {
        if (user.getTotpRecoveryHash() == null) return false;
        return totpCodec.hashRecoveryCode(code).equals(user.getTotpRecoveryHash());
    }

    private void clearTwoFactor(User user) {
        user.setTotpSecret(null);
        user.setTotpRecoveryHash(null);
        user.setTwoFactorEnabled(false);
    }

    private User mustFindUser(UUID userId) {
        return userRepository.findById(userId).orElseThrow(() ->
            new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                "사용자를 찾을 수 없습니다"));
    }

    public record VerifyResult(boolean ok, boolean recoveryUsed) {}
}
