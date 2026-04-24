package com.secretbox.user.dto;

import java.time.Instant;

public record SessionListItem(
    String id,
    String userAgent,
    String ipAddress,
    Instant createdAt,
    Instant lastSeenAt,
    Instant expiresAt,
    boolean current
) {}
