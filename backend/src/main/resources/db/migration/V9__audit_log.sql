-- 사용자 활동 로그 — 사후 조사, 본인 활동 검토, 이상 감지용.
--
-- 누가/언제/어떤 행동을 했는지 기록.
-- 추적 액션: 가입, 로그인, 비번 변경, 2FA 변경, 세션 폐기, 항목 CRUD, 잠금 등
--
-- 90일 후 자동 cleanup은 별도 잡으로 처리 (이번 슬라이스 외).

-- IF NOT EXISTS — dev/prod 병렬 환경에서 한 쪽이 먼저 부분 적용했어도 통과되도록
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(64)  NOT NULL,
    target_type VARCHAR(32),
    target_id   VARCHAR(64),
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 사용자별 시간 역순 조회용 (Settings 활동 탭에서 가장 흔한 쿼리)
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_logs(user_id, created_at DESC);

-- cleanup 효율 위해 시각 단독 인덱스도
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
