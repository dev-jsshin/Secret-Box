package com.secretbox.audit.dto;

import java.util.List;

public record AuditLogPageResponse(
    List<AuditLogDto> entries,
    int page,
    int size,
    long totalElements,
    boolean hasNext
) {}
