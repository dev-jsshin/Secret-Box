package com.secretbox.user.dto;

/** 2FA enrollment 1단계 응답 — secret과 otpauth URI를 사용자에게 보여주고
 *  authenticator 앱에 등록하라고 안내. confirm 호출 전엔 실제로 활성화 X. */
public record TwoFactorInitResponse(
    String secret,
    String otpauthUri
) {}
