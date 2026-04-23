package com.secretbox.auth.dto;

import java.util.UUID;

public record LoginResponse(
    String accessToken,
    String protectedDek,       // base64
    String protectedDekIv,     // base64
    UserSummary user
) {
    public record UserSummary(UUID id, String email) {}
}
