-- UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- users
-- ========================================
CREATE TABLE users (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email              TEXT        UNIQUE NOT NULL,

    auth_hash          TEXT        NOT NULL,
    kdf_salt           BYTEA       NOT NULL,
    kdf_iterations     INT         NOT NULL DEFAULT 3,
    kdf_memory_kb      INT         NOT NULL DEFAULT 65536,
    kdf_parallelism    INT         NOT NULL DEFAULT 4,

    protected_dek      BYTEA       NOT NULL,
    protected_dek_iv   BYTEA       NOT NULL,

    recovery_hash      TEXT,
    two_factor_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    email_verified_at  TIMESTAMPTZ,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);

-- ========================================
-- email verification codes (2FA, email verify, password reset)
-- ========================================
CREATE TABLE email_verification_codes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT        NOT NULL,
    purpose     TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    attempts    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evc_user_purpose ON email_verification_codes(user_id, purpose);
CREATE INDEX idx_evc_expires     ON email_verification_codes(expires_at);

-- ========================================
-- sessions (refresh tokens)
-- ========================================
CREATE TABLE sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT        NOT NULL UNIQUE,
    user_agent          TEXT,
    ip_address          INET,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user  ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(refresh_token_hash);

-- ========================================
-- vault items
-- ========================================
CREATE TABLE vault_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type       TEXT        NOT NULL,
    encrypted_data  BYTEA       NOT NULL,
    encrypted_iv    BYTEA       NOT NULL,
    version         INT         NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_items_user    ON vault_items(user_id);
CREATE INDEX idx_vault_items_deleted ON vault_items(deleted_at);

-- ========================================
-- vault item history (snapshots of previous versions)
-- ========================================
CREATE TABLE vault_item_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_item_id   UUID        NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_data  BYTEA       NOT NULL,
    encrypted_iv    BYTEA       NOT NULL,
    change_type     TEXT        NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vih_item_time ON vault_item_history(vault_item_id, changed_at DESC);

-- ========================================
-- audit logs
-- ========================================
CREATE TABLE audit_logs (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_time ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action    ON audit_logs(action);
