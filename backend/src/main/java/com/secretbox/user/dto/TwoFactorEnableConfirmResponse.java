package com.secretbox.user.dto;

/**
 * confirm-enable 응답 — 단일 long recovery code를 한 번만 평문으로 반환.
 * 서버는 hash만 보관하므로 사용자가 안전한 곳에 저장해야 함.
 * 사용 시 2FA가 자동 비활성화됨 (kill switch).
 */
public record TwoFactorEnableConfirmResponse(
    String recoveryCode
) {}
