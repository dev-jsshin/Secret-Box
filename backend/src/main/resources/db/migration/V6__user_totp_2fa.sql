-- 마스터 로그인용 TOTP 2FA.
--   totp_secret: base32 — 사용자 authenticator와 공유하는 secret
--   totp_recovery_hashes: 8개의 SHA-256 hashed recovery code (분실 대비)
-- two_factor_enabled (기존 컬럼)은 활성/비활성 토글로 사용:
--   true && totp_secret IS NOT NULL → 로그인 시 TOTP 코드 요구

ALTER TABLE users
    ADD COLUMN totp_secret           VARCHAR(64),
    ADD COLUMN totp_recovery_hashes  TEXT[];

-- 기존 row들은 totp_secret이 없으니 강제로 false (이전 default true 였음)
UPDATE users SET two_factor_enabled = FALSE WHERE totp_secret IS NULL;

-- 새 가입자는 enrollment 전엔 false로 시작
ALTER TABLE users ALTER COLUMN two_factor_enabled SET DEFAULT FALSE;
