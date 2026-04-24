package com.secretbox.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 2FA 로그인 2단계 — login에서 받은 단명 토큰 + authenticator 코드(또는 recovery). */
public record Login2faRequest(
    @NotBlank @Size(max = 1024) String twoFactorToken,
    @NotBlank @Size(max = 32) String code
) {}
