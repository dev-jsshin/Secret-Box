package com.secretbox.user.dto;

/** 2FA 활성 상태. recovery는 1개 single-use라 별도 카운트 없음. */
public record TwoFactorStatusResponse(
    boolean enabled
) {}
