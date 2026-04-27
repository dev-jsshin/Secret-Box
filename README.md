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
| **Docker** | Compose v2 포함 (도커 한 번으로 실행할 때 이것만 있으면 됨) |
| **Node.js** | 20.18+ 또는 22+ (IDE 기반 개발 시) |
| **Java** | 21 (IDE 기반 개발 시) |

## 빠른 시작 — Docker 한 번에 (권장)

본인/친구 몇 명이 LAN에서 쓰기에 충분한 구성.

```bash
git clone https://github.com/dev-jsshin/Secret-Box.git
cd Secret-Box

# 1) 환경변수 템플릿 복사
cp .env.example .env

# 2) .env 열어서 반드시 교체
#    - JWT_SECRET: openssl rand -base64 48 로 생성한 값
#    - POSTGRES_PASSWORD: 강한 랜덤 비밀번호

# 3) 빌드 + 실행 (Postgres + 백엔드 + nginx 프론트 한 번에)
docker compose up -d --build

# 4) 상태 확인
docker compose ps
docker compose logs -f
```

접속: `https://<호스트-IP>:7444`
- 같은 Mac에서: `https://localhost:7444`
- LAN의 다른 PC에서: `https://192.168.x.x:7444` (호스트 Mac의 LAN IP)

> ⚠️ **최초 접속 시 브라우저가 "안전하지 않은 사이트" 경고**를 띄웁니다.
> self-signed 인증서라 정상입니다. "고급 → 안전하지 않은 사이트로 진행" 누르면 됩니다.
> 인증서는 컨테이너 볼륨에 유지되므로 재빌드 시 동일한 것이 재사용됩니다.

> ⚠️ HTTP가 아닌 **HTTPS**로 접속해야 합니다. WebCrypto API는 secure context에서만 동작합니다.

**코드 수정 후 반영:** `docker compose up -d --build`

**완전 초기화:** `docker compose down -v` (DB 포함 삭제)

## 개발 모드 (IDE + Vite 라이브 리로드)

기능 개발 시엔 도커 대신 IDE에서 직접 실행이 빠릅니다.

```bash
# 1) Postgres만 도커로 (백엔드/프론트는 호스트에서 실행)
cp .env.example .env   # 이미 있으면 생략
docker compose up -d postgres

# 2) 백엔드용 env
cp backend/.env.example backend/.env
# JWT_SECRET 교체
```

**백엔드 (IntelliJ):**
1. `backend/`를 Gradle 프로젝트로 import
2. [EnvFile 플러그인](https://plugins.jetbrains.com/plugin/7861-envfile) 설치 후 재시작
3. `SecretBoxApplication` Run Configuration → EnvFile 탭에서 `backend/.env` 추가
4. Run → http://localhost:6333

**프론트엔드 (Vite):**
```bash
cd frontend
npm install
npm run dev    # 최초엔 sudo 비밀번호로 mkcert 시스템 등록
```
→ `https://localhost:7444` (브라우저 경고 없음 — mkcert 덕분)

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

## 주요 기능

- **항목 CRUD** — 카탈로그 기반 등록 (Naver, Google, Kakao 등 30+ 브랜드 자동 매칭). 별칭으로 같은 서비스의 여러 계정 구분 (회사/개인 등).
- **변경 이력** — 각 항목의 필드별 변경 내역 조회 (읽기 전용 diff).
- **마스터 비밀번호 변경** — 새 KEK로 DEK만 다시 감싸므로 항목 재암호화 불필요. 변경 시 다른 모든 세션 강제 로그아웃.
- **자동 잠금** — 일정 시간 idle 시 메모리의 DEK 폐기 → 잠금 화면. 마스터 비번 입력만으로 풀림 (서버 호출 없음). 5/15/30분/안 함 설정 + "지금 잠그기".
- **Refresh token 회전** — 30일 유지, 사용 시마다 새 토큰 발급 + 이전 토큰 폐기 (재사용 감지).

## 디렉토리 구조

```
.
├── backend/                  Spring Boot 3 + Java 21 (IDE 실행)
│   ├── .env.example
│   └── src/main/
│       ├── java/com/secretbox/
│       │   ├── auth/         회원가입/로그인/refresh, JWT, 세션
│       │   ├── user/         User + 마스터 비번 변경
│       │   ├── vault/        VaultItem + VaultItemHistory
│       │   ├── catalog/      서비스 카탈로그 (브랜드 메타)
│       │   ├── config/       Security, CORS
│       │   └── common/       전역 예외, ApiError
│       └── resources/
│           ├── application.yml
│           └── db/migration/  Flyway SQL (V1~V4)
├── frontend/                 React 18 + Vite + TS
│   ├── .env.example
│   └── src/
│       ├── pages/            Register, Login, Vault, Settings
│       ├── components/       Logo, FormField, Modal, AlertModal,
│       │   │                 LockScreen, SecurityExplainer
│       │   └── vault/        Avatar, AddEditItemModal,
│       │                     ItemHistoryModal, CatalogPicker
│       ├── hooks/            useIdleLock
│       ├── crypto/           Argon2 + AES-GCM + base64
│       ├── api/              client (refresh 자동 회전), auth, users,
│       │                     vault, catalog
│       └── store/            zustand — session (DEK 메모리만),
│                             lockSettings (자동 잠금 설정)
├── docs/
│   └── architecture.md       보안 모델 + API 스펙 상세
├── docker-compose.yml        Postgres만 실행
└── .env.example
```

## 개발 상태

- ✅ Zero-knowledge architecture (KEK/DEK, Argon2id + AES-256-GCM)
- ✅ 회원가입 / 로그인 (refresh token 회전 포함)
- ✅ 비밀번호 항목 CRUD (카탈로그 기반)
- ✅ 항목별 변경 이력
- ✅ 마스터 비밀번호 변경 (다른 세션 강제 로그아웃)
- ✅ 자동 잠금 + 잠금 화면 (서버 호출 없는 클라이언트 단독 unlock)
- ⬜ 활성 세션 목록 (다른 기기 강제 로그아웃 UI)
- ⬜ Rate limit 및 운영 배포 준비

## Credits

Crafted by **dev-jsshin** · **신준섭**
