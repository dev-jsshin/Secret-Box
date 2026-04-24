package com.secretbox.user.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "auth_hash", nullable = false)
    private String authHash;

    @Column(name = "kdf_salt", nullable = false)
    private byte[] kdfSalt;

    @Column(name = "kdf_iterations", nullable = false)
    private int kdfIterations;

    @Column(name = "kdf_memory_kb", nullable = false)
    private int kdfMemoryKb;

    @Column(name = "kdf_parallelism", nullable = false)
    private int kdfParallelism;

    @Column(name = "protected_dek", nullable = false)
    private byte[] protectedDek;

    @Column(name = "protected_dek_iv", nullable = false)
    private byte[] protectedDekIv;

    @Column(name = "recovery_hash")
    private String recoveryHash;

    @Column(name = "two_factor_enabled", nullable = false)
    private boolean twoFactorEnabled;

    /** 마스터 로그인용 TOTP secret (base32). NULL이면 미등록. */
    @Column(name = "totp_secret", length = 64)
    private String totpSecret;

    /**
     * 단일 long recovery code의 SHA-256 hash (base64).
     * 사용 시 2FA 자동 비활성화 ("kill switch") — 사용자는 다시 enroll 해야 함.
     */
    @Column(name = "totp_recovery_hash", length = 128)
    private String totpRecoveryHash;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
