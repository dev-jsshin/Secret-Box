package com.secretbox.user.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank @Size(max = 1024)
    String oldAuthHash,         // base64

    @NotBlank @Size(max = 1024)
    String newAuthHash,         // base64

    @NotBlank @Size(max = 256)
    String newKdfSalt,          // base64

    @Min(1)
    int newKdfIterations,

    @Min(1024)
    int newKdfMemoryKb,

    @Min(1)
    int newKdfParallelism,

    @NotBlank @Size(max = 1024)
    String newProtectedDek,     // base64 — 새 KEK로 다시 감싼 같은 DEK

    @NotBlank @Size(max = 64)
    String newProtectedDekIv    // base64
) {}
