package com.secretbox.vault.repository;

import com.secretbox.vault.domain.VaultItemHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VaultItemHistoryRepository extends JpaRepository<VaultItemHistory, UUID> {
    List<VaultItemHistory> findAllByVaultItemIdOrderByChangedAtDesc(UUID vaultItemId);
}
