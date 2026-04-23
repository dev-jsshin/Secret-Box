package com.secretbox.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank @Email @Size(max = 255)
    String email,

    @NotBlank @Size(max = 1024)
    String authHash,            // base64

    @NotBlank @Size(max = 256)
    String kdfSalt,             // base64

    @Min(1)
    int kdfIterations,

    @Min(1024)
    int kdfMemoryKb,

    @Min(1)
    int kdfParallelism,

    @NotBlank @Size(max = 1024)
    String protectedDek,        // base64

    @NotBlank @Size(max = 64)
    String protectedDekIv,      // base64

    @Size(max = 512)
    String recoveryCodeHash     // optional
) {}
