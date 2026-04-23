package com.secretbox.vault.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "vault_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VaultItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "item_type", nullable = false)
    private String itemType;

    @Column(name = "encrypted_data", nullable = false)
    private byte[] encryptedData;

    @Column(name = "encrypted_iv", nullable = false)
    private byte[] encryptedIv;

    @Version
    @Column(nullable = false)
    private int version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
