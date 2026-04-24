package com.secretbox.user.dto;

public record ChangePasswordResponse(
    String accessToken,
    String refreshToken,        // 회전된 새 토큰 (모든 기기 강제 로그아웃됨)
    String message
) {}
