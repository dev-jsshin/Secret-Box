-- 2FA recovery 모델을 단순화: 8개 single-use → 1개 long single-use ("kill switch").
-- 사용 시 2FA 자동 비활성화 → 사용자는 다시 enroll 필요.
--
-- 우리 모델에선 recovery code가 데이터를 풀지 않고 TOTP 단계만 우회하므로 1개로 충분.
-- 마스터 비번은 어차피 별도 입력해서 KEK/DEK는 그쪽이 보호.

ALTER TABLE users ADD COLUMN totp_recovery_hash VARCHAR(128);

-- 기존 hash 배열은 폐기 (V6 이후 enrollment 한 사용자는 재등록 필요)
ALTER TABLE users DROP COLUMN totp_recovery_hashes;

-- 안전을 위해, 활성화돼있던 사용자도 recovery_hash가 비었으면 강제 비활성화
UPDATE users SET two_factor_enabled = FALSE WHERE totp_recovery_hash IS NULL;
