-- 세션을 "기기 단위"로 식별 + 마지막 활동 시각 추가.
--   device_id: 클라이언트 localStorage UUID. (userId, device_id) active 1개로 dedup.
--   last_seen_at: refresh token 회전마다 갱신 — "이 기기 마지막 활동" 표시용.

ALTER TABLE sessions
    ADD COLUMN device_id     VARCHAR(64),
    ADD COLUMN last_seen_at  TIMESTAMPTZ;

-- 기존 row는 created_at으로 backfill
UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;

-- (userId, device_id) 활성 세션 dedup용 partial index
CREATE INDEX idx_sessions_user_device_active
    ON sessions(user_id, device_id)
    WHERE revoked_at IS NULL;
