package com.secretbox.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** confirm-enable / disable / login-2fa 등에서 공통적으로 쓰는 코드 입력 DTO. */
public record TwoFactorCodeRequest(
    @NotBlank @Size(max = 32) String code
) {}
