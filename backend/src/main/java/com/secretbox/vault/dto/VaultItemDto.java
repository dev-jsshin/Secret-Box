package com.secretbox.vault.dto;

import com.secretbox.vault.domain.VaultItem;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public record VaultItemDto(
    UUID id,
    String itemType,
    String encryptedData,        // base64
    String encryptedIv,          // base64
    int version,
    Instant createdAt,
    Instant updatedAt
) {
    public static VaultItemDto from(VaultItem item) {
        return new VaultItemDto(
            item.getId(),
            item.getItemType(),
            Base64.getEncoder().encodeToString(item.getEncryptedData()),
            Base64.getEncoder().encodeToString(item.getEncryptedIv()),
            item.getVersion(),
            item.getCreatedAt(),
            item.getUpdatedAt()
        );
    }
}
