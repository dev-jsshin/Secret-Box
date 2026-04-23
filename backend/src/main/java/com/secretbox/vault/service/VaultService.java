package com.secretbox.vault.service;

import com.secretbox.common.exception.ApiException;
import com.secretbox.vault.domain.VaultItem;
import com.secretbox.vault.domain.VaultItemHistory;
import com.secretbox.vault.dto.CreateVaultItemRequest;
import com.secretbox.vault.dto.UpdateVaultItemRequest;
import com.secretbox.vault.dto.VaultItemDto;
import com.secretbox.vault.repository.VaultItemHistoryRepository;
import com.secretbox.vault.repository.VaultItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class VaultService {

    private final VaultItemRepository vaultItemRepository;
    private final VaultItemHistoryRepository historyRepository;

    @Transactional(readOnly = true)
    public List<VaultItemDto> list(UUID userId) {
        return vaultItemRepository.findAllByUserIdAndDeletedAtIsNull(userId).stream()
            .map(VaultItemDto::from)
            .toList();
    }

    @Transactional
    public VaultItemDto create(UUID userId, CreateVaultItemRequest req) {
        VaultItem item = VaultItem.builder()
            .userId(userId)
            .itemType(req.itemType())
            .encryptedData(decodeBase64(req.encryptedData(), "encryptedData"))
            .encryptedIv(decodeBase64(req.encryptedIv(), "encryptedIv"))
            .build();
        VaultItem saved = vaultItemRepository.save(item);
        log.info("Vault item created: id={}, user={}", saved.getId(), userId);
        return VaultItemDto.from(saved);
    }

    @Transactional
    public VaultItemDto update(UUID userId, UUID itemId, UpdateVaultItemRequest req) {
        VaultItem item = findOwned(userId, itemId);

        if (item.getVersion() != req.expectedVersion()) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
                "다른 기기에서 먼저 수정되었습니다");
        }

        // 이전 버전 스냅샷을 history에 저장
        historyRepository.save(VaultItemHistory.builder()
            .vaultItemId(item.getId())
            .userId(userId)
            .encryptedData(item.getEncryptedData())
            .encryptedIv(item.getEncryptedIv())
            .changeType("updated")
            .build());

        item.setEncryptedData(decodeBase64(req.encryptedData(), "encryptedData"));
        item.setEncryptedIv(decodeBase64(req.encryptedIv(), "encryptedIv"));

        return VaultItemDto.from(item);
    }

    @Transactional
    public void delete(UUID userId, UUID itemId) {
        VaultItem item = findOwned(userId, itemId);
        item.setDeletedAt(Instant.now());
        log.info("Vault item soft-deleted: id={}, user={}", itemId, userId);
    }

    private VaultItem findOwned(UUID userId, UUID itemId) {
        VaultItem item = vaultItemRepository.findById(itemId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ITEM_NOT_FOUND",
                "항목을 찾을 수 없습니다"));

        if (!item.getUserId().equals(userId) || item.getDeletedAt() != null) {
            // 다른 사람 항목이거나 이미 삭제된 항목 — NOT_FOUND로 통일 (존재 여부 노출 방지)
            throw new ApiException(HttpStatus.NOT_FOUND, "ITEM_NOT_FOUND",
                "항목을 찾을 수 없습니다");
        }
        return item;
    }

    private byte[] decodeBase64(String value, String fieldName) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BASE64",
                fieldName + " 필드의 base64 디코딩 실패");
        }
    }
}
