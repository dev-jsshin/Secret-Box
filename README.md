# SecretBox

Zero-knowledge 아키텍처 기반 개인 패스워드 매니저.
서버는 마스터 패스워드도, 저장된 비밀번호의 평문도 절대 보지 못합니다.

## 아키텍처

- **프론트**: React (Vite + TypeScript) + WebCrypto API
- **백엔드**: Spring Boot 3 (Java 21) + Spring Security + JWT
- **DB**: PostgreSQL 16 (Flyway 마이그레이션, Docker로 실행)

```
┌─────────────────────┐   HTTPS   ┌─────────────────────┐   JDBC   ┌──────────────┐
│  React (브라우저)   │ ────────→ │  Spring Boot API    │ ───────→ │  Postgres    │
│  - WebCrypto API    │           │  - Spring Security  │          │  (Docker)    │
│  - KEK/DEK 파생     │           │  - JWT + Refresh    │          │              │
│  - 암호화/복호화    │           │  - Flyway           │          │              │
└─────────────────────┘           └─────────────────────┘          └──────────────┘
```

키 계층:

```
마스터 패스워드 (사용자 머릿속)
      │ Argon2id
      ▼
  KEK (32B, 브라우저 메모리에만)
      │ AES-GCM 복호화
      ▼
  DEK (32B, 브라우저 메모리에만)
      │ AES-GCM 암호화
      ▼
 vault item plaintext JSON
```

상세 흐름과 위협 모델: [docs/architecture.md](docs/architecture.md)

## 실행 방법

### 1) Postgres (Docker)

```bash
cp .env.example .env
docker compose up -d
docker compose ps   # secretbox-postgres healthy 확인
```

### 2) 백엔드 (IntelliJ 등 IDE)

```bash
cp backend/.env.example backend/.env
```

- `backend/`를 Gradle 프로젝트로 Import
- IntelliJ에 [EnvFile 플러그인](https://plugins.jetbrains.com/plugin/7861-envfile) 설치
- `SecretBoxApplication` Run Configuration → EnvFile 탭 → `backend/.env` 추가
- 실행 → http://localhost:6333

### 3) 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

→ http://localhost:7444

> 백엔드 주소를 바꿀 때만 `frontend/.env.local` 만들어 `VITE_API_BASE_URL=...` 설정.
