-- 로그인 실패 카운터 + 자동 잠금.
--   failed_login_count: 연속 실패 횟수 (성공 시 0으로 리셋)
--   locked_until:       이 시각까지 로그인 거부. NULL이면 잠금 없음.
--
-- 정책: 5회 연속 실패 → 15분 잠금. AuthService에서 처리.

ALTER TABLE users
    ADD COLUMN failed_login_count INT         NOT NULL DEFAULT 0,
    ADD COLUMN locked_until       TIMESTAMPTZ;
