package com.secretbox.vault.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateVaultItemRequest(
    @NotBlank
    @Pattern(regexp = "login|note|card", message = "지원하지 않는 itemType")
    String itemType,

    @NotBlank @Size(max = 65536)
    String encryptedData,        // base64

    @NotBlank @Size(max = 64)
    String encryptedIv           // base64
) {}
