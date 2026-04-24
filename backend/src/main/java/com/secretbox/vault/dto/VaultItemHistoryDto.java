package com.secretbox.vault.dto;

import com.secretbox.vault.domain.VaultItemHistory;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public record VaultItemHistoryDto(
    UUID id,
    String changeType,        // "updated" | "restored"
    String encryptedData,     // base64
    String encryptedIv,       // base64
    Instant changedAt
) {
    public static VaultItemHistoryDto from(VaultItemHistory h) {
        return new VaultItemHistoryDto(
            h.getId(),
            h.getChangeType(),
            Base64.getEncoder().encodeToString(h.getEncryptedData()),
            Base64.getEncoder().encodeToString(h.getEncryptedIv()),
            h.getChangedAt()
        );
    }
}
