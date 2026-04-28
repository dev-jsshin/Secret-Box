package com.secretbox.audit.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuditLogDto(
    Long id,
    String action,
    String targetType,
    String targetId,
    String ipAddress,
    String userAgent,
    Instant createdAt
) {}
