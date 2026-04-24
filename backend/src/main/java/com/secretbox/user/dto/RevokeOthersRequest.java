package com.secretbox.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RevokeOthersRequest(
    @NotBlank @Size(max = 256) String currentRefreshToken
) {}
