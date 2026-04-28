package com.secretbox.audit.domain;

/**
 * 추적 액션 상수. DB엔 문자열로 저장되며 enum이 아닌 String constant로 두어
 * 마이그레이션/이름 변경에 유연하게.
 */
public final class AuditAction {
    private AuditAction() {}

    // 인증
    public static final String REGISTER             = "REGISTER";
    public static final String LOGIN_SUCCESS        = "LOGIN_SUCCESS";
    public static final String LOGIN_FAIL           = "LOGIN_FAIL";
    public static final String LOGIN_2FA_SUCCESS    = "LOGIN_2FA_SUCCESS";
    public static final String LOGIN_2FA_FAIL       = "LOGIN_2FA_FAIL";
    public static final String LOGOUT               = "LOGOUT";
    public static final String ACCOUNT_LOCKED       = "ACCOUNT_LOCKED";

    // 비번 / 2FA
    public static final String MASTER_PASSWORD_CHANGE = "MASTER_PASSWORD_CHANGE";
    public static final String TOTP_ENABLED           = "TOTP_ENABLED";
    public static final String TOTP_DISABLED          = "TOTP_DISABLED";
    public static final String RECOVERY_USED          = "RECOVERY_USED";

    // 세션
    public static final String SESSION_REVOKED         = "SESSION_REVOKED";          // 단일
    public static final String OTHER_SESSIONS_REVOKED  = "OTHER_SESSIONS_REVOKED";   // 다른 모두
    public static final String ALL_SESSIONS_REVOKED    = "ALL_SESSIONS_REVOKED";     // 비번 변경 시

    // 항목
    public static final String ITEM_CREATE = "ITEM_CREATE";
    public static final String ITEM_UPDATE = "ITEM_UPDATE";
    public static final String ITEM_DELETE = "ITEM_DELETE";
}
