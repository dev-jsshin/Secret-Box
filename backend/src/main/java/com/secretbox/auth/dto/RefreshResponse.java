package com.secretbox.auth.dto;

public record RefreshResponse(
    String accessToken,
    String refreshToken          // 회전된 새 refresh (이전 것은 폐기됨)
) {}
