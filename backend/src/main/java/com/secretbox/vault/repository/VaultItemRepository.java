package com.secretbox.vault.repository;

import com.secretbox.vault.domain.VaultItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VaultItemRepository extends JpaRepository<VaultItem, UUID> {
    List<VaultItem> findAllByUserIdAndDeletedAtIsNull(UUID userId);
}
