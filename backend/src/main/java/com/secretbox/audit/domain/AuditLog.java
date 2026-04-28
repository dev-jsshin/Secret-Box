package com.secretbox.audit.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 행위자. 사용자 삭제 시 SET NULL되어 로그 자체는 보존. */
    @Column(name = "user_id")
    private UUID userId;

    /** AuditAction 상수. */
    @Column(nullable = false, length = 64)
    private String action;

    /** "item" / "session" / null 등 — 영향 받은 엔티티 종류 */
    @Column(name = "target_type", length = 32)
    private String targetType;

    /** 영향 받은 엔티티 id (UUID 또는 기타 식별자) */
    @Column(name = "target_id", length = 64)
    private String targetId;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent")
    private String userAgent;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
