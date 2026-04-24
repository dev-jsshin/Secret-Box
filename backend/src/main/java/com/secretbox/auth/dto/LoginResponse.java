package com.secretbox.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * 두 가지 형태의 응답을 한 record로 처리.
 *   1) 2FA 미사용/미활성: requires2fa=false, accessToken/refreshToken/protectedDek 채워짐
 *   2) 2FA 활성: requires2fa=true, twoFactorToken만 채워짐 (5분 유효)
 *
 * Jackson NON_NULL로 직렬화해서 한 응답엔 한쪽 필드만 노출.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoginResponse(
    boolean requires2fa,
    String twoFactorToken,
    String accessToken,
    String refreshToken,         // opaque random (서버는 hash로만 저장)
    String protectedDek,         // base64
    String protectedDekIv,       // base64
    UserSummary user,
    /** recovery code로 통과 → 2FA가 자동 비활성화됐음을 클라이언트에 알림 */
    Boolean recoveryUsed
) {
    public record UserSummary(UUID id, String email) {}

    public static LoginResponse fullSession(
        String accessToken, String refreshToken,
        String protectedDek, String protectedDekIv,
        UserSummary user,
        boolean recoveryUsed
    ) {
        return new LoginResponse(false, null, accessToken, refreshToken,
            protectedDek, protectedDekIv, user, recoveryUsed ? true : null);
    }

    public static LoginResponse twoFactorRequired(String twoFactorToken) {
        return new LoginResponse(true, twoFactorToken, null, null, null, null, null, null);
    }
}
