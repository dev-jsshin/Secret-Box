package com.secretbox.vault.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "vault_item_history")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VaultItemHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "vault_item_id", nullable = false)
    private UUID vaultItemId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "encrypted_data", nullable = false)
    private byte[] encryptedData;

    @Column(name = "encrypted_iv", nullable = false)
    private byte[] encryptedIv;

    @Column(name = "change_type", nullable = false)
    private String changeType;

    @CreationTimestamp
    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt;
}
