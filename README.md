# SecretBox

> 오직 당신만 아는 비밀번호 저장소.

Zero-knowledge 비밀번호 매니저.
서버는 마스터 비밀번호도, 저장된 비밀번호 평문도 절대 보지 못합니다.

## 아키텍처

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
마스터 비밀번호 (사용자 머릿속)
      │ Argon2id
      ▼
  KEK (브라우저 메모리에만)
      │ AES-GCM 복호화
      ▼
  DEK (브라우저 메모리에만)
      │ AES-GCM 암호화
      ▼
 vault item plaintext JSON
```

상세 보안 모델: [docs/architecture.md](docs/architecture.md)

## 사전 요구사항

| | 버전 |
|---|---|
| **Node.js** | 20.18+ 또는 22+ ([vite-plugin-mkcert](https://github.com/liuweiGL/vite-plugin-mkcert) 호환) |
| **Java** | 21 |
| **Docker** | Compose v2 포함 |
| **IDE (권장)** | IntelliJ IDEA + [EnvFile 플러그인](https://plugins.jetbrains.com/plugin/7861-envfile) |

## 빠른 시작

### 1) 환경변수 파일 준비

```bash
git clone <repo-url>
cd SecretBox

# Postgres용 (Docker)
cp .env.example .env

# 백엔드용 (IDE 실행 시 EnvFile 플러그인이 읽음)
cp backend/.env.example backend/.env
```

`backend/.env`의 `JWT_SECRET`은 **반드시 직접 생성한 값으로 교체**:
```bash
openssl rand -base64 48   # 출력값을 JWT_SECRET= 뒤에 붙여넣기
```

### 2) Postgres 시작

```bash
docker compose up -d
docker compose ps   # secretbox-postgres가 healthy 상태 확인
```

### 3) 백엔드 실행 (IntelliJ 등)

1. `backend/`를 Gradle 프로젝트로 import
2. **EnvFile 플러그인 설치** 후 IntelliJ 재시작
3. `SecretBoxApplication` Run Configuration 열기
4. **EnvFile 탭** → `Enable EnvFile` 체크 → `+` → `backend/.env` 추가
5. Run

→ http://localhost:6333

### 4) 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

🔐 **최초 실행 시 sudo 비밀번호를 물어봅니다** — 자체 서명 SSL 인증서를 시스템 신뢰 저장소에 등록하기 위함 (mkcert). 한 번만 입력하면 이후엔 묻지 않습니다.

콘솔 출력 확인:
```
  ➜  Local:   https://localhost:7444/
  ➜  Network: https://192.168.x.x:7444/
```

브라우저로 `https://localhost:7444` 접속.

> ⚠️ HTTP가 아닌 **HTTPS**로 접속해야 합니다. WebCrypto API가 secure context에서만 동작합니다.

## 설정 변경

### 포트 변경

| 변경 대상 | 파일 | 키 |
|---|---|---|
| 백엔드 포트 | `backend/.env` | `SERVER_PORT` (생략 시 6333) |
| 백엔드 포트 변경 시 프록시도 | `frontend/.env.local` | `VITE_BACKEND_ORIGIN` |
| 프론트 포트 | `frontend/.env.local` | `VITE_PORT` (생략 시 7444) |
| Postgres 포트 | `.env` | `POSTGRES_PORT` |

> Postgres 포트를 바꾸면 `backend/.env`의 `SPRING_DATASOURCE_URL`도 같이 수정하세요.

### CORS 허용 Origin

`backend/src/main/resources/application.yml`의 `app.cors.allowed-origin-patterns`에서 관리. 기본은 localhost + 사설 IP 대역 모두 허용.

운영 배포 시 실제 도메인만 남기세요:
```yaml
app:
  cors:
    allowed-origin-patterns:
      - https://app.secretbox.example.com
```

## 같은 네트워크의 다른 PC에서 접속

1. dev 머신의 IP 확인 (Mac):
   ```bash
   ipconfig getifaddr en0
   ```
2. 다른 PC 브라우저: `https://<dev-ip>:7444`
3. 인증서 경고 → "고급" → "안전하지 않은 사이트로 진행" (dev 환경 전용)
4. 정상 동작

> Mac 방화벽이 7444 포트를 막고 있으면 시스템 환경설정에서 노드 프로세스의 들어오는 연결을 허용하세요.

## 자주 발생하는 문제

### `webidl.util.markAsUncloneable is not a function`
Node 20.9 이하에서 발생. **Node 20.18+ 또는 22+**로 업그레이드:
```bash
nvm install 22 && nvm use 22
cd frontend && rm -rf node_modules && npm install
```

### `crypto.subtle is undefined`
HTTP로 접속 중. 반드시 **HTTPS**로 접속하세요. URL이 `https://`로 시작하는지 확인.

### `net::ERR_CERT_AUTHORITY_INVALID`
mkcert 시스템 등록이 실패한 경우. dev 머신에서:
```bash
cd frontend && npm run dev   # 다시 실행하면 sudo 프롬프트 재시도
```
다른 PC에선 인증서 경고 → "안전하지 않은 사이트로 진행" 누르면 됩니다.

### `403 Forbidden` (가입 요청)
백엔드 CORS가 현재 Origin을 허용 안 함. `application.yml`의 `app.cors.allowed-origin-patterns` 확인 후 백엔드 재시작.

### "서버에 연결할 수 없습니다" 모달
백엔드가 떠 있지 않음. IntelliJ에서 `SecretBoxApplication` Run 상태 확인.

### 프론트가 7444 대신 7445 등 다른 포트로 뜸
이전 vite 프로세스가 7444를 점유 중. 죽이고 재시작:
```bash
lsof -ti:7444 | xargs kill
cd frontend && npm run dev
```

## 디렉토리 구조

```
.
├── backend/                  Spring Boot 3 + Java 21 (IDE 실행)
│   ├── .env.example          백엔드 환경변수 템플릿
│   └── src/main/
│       ├── java/com/secretbox/
│       │   ├── auth/         회원가입/로그인 (DTO, 서비스, 컨트롤러)
│       │   ├── user/         User 엔티티 + 레포
│       │   ├── vault/        VaultItem + VaultItemHistory
│       │   ├── config/       SecurityConfig, CorsConfig
│       │   └── common/       전역 예외, ApiError 등
│       └── resources/
│           ├── application.yml
│           └── db/migration/  Flyway SQL
├── frontend/                 React 18 + Vite + TS (npm run dev)
│   ├── .env.example          프론트 환경변수 템플릿
│   └── src/
│       ├── pages/            Register, Login
│       ├── components/       Logo, FormField, Modal, AlertModal 등
│       ├── crypto/           Argon2 + AES-GCM + base64
│       ├── api/              client, auth, vault
│       └── store/            zustand 세션 (DEK는 메모리에만)
├── docs/
│   └── architecture.md       보안 모델 + API 스펙 상세
├── docker-compose.yml        Postgres만 실행
└── .env.example              Postgres 변수 템플릿
```

## 개발 상태

v1 진행 중 (회원가입까지 완료):
- ✅ Zero-knowledge architecture (KEK/DEK)
- ✅ 회원가입 (UI + API + 클라/서버 양쪽 Argon2)
- ⬜ 로그인 (Pre-login + 패스워드 검증 + 2FA 이메일)
- ⬜ 비밀번호 항목 CRUD
- ⬜ 변경 기록 / 롤백
- ⬜ 세션 관리

## Credits

Crafted by **dev-jsshin** · **신준섭**
