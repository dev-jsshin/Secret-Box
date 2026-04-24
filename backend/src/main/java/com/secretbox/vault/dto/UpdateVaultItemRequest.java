package com.secretbox.vault.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateVaultItemRequest(
    @NotBlank @Size(max = 65536)
    String encryptedData,

    @NotBlank @Size(max = 64)
    String encryptedIv,

    @Min(0)
    int expectedVersion          // 낙관적 락 — JPA @Version이 INSERT 시 0이라 0부터 허용
) {}
