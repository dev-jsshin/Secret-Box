-- Postgres inet 타입은 JPA String 매핑과 묶기 까다로움 (자동 캐스팅 X).
-- 운영 시 단순 텍스트로 보관해도 충분 — IPv6 최대 45자.

ALTER TABLE sessions   ALTER COLUMN ip_address TYPE VARCHAR(45) USING ip_address::text;
ALTER TABLE audit_logs ALTER COLUMN ip_address TYPE VARCHAR(45) USING ip_address::text;
