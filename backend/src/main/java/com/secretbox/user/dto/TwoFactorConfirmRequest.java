package com.secretbox.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 2FA enrollment 확인 — 두 연속 코드 (현재 + 30초 뒤 새로 갱신될 코드).
 * authenticator가 secret을 정확히 등록했음을 단일 코드보다 강하게 입증.
 * AWS, GitHub, Google 등 주요 서비스의 enrollment 패턴.
 */
public record TwoFactorConfirmRequest(
    @NotBlank @Size(max = 10) String code1,
    @NotBlank @Size(max = 10) String code2
) {}
