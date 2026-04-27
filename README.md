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

## 사전 요구사항

| | 버전 | 언제 필요 |
|---|---|---|
| **Docker** | Compose v2 포함 | 도커 한 번에 띄울 때 (대부분의 사용자) |
| **Node.js** | 20.18+ 또는 22+ | 프론트 코드 수정하며 라이브 리로드 쓸 때 |
| **Java** | 21 | 백엔드 코드 수정하며 IDE에서 실행할 때 |

---

## 1. 빠른 시작 — Docker 한 방 (권장)

본인/친구 몇 명이 LAN에서 쓰기에 충분한 구성. Postgres + 백엔드 + nginx 프론트가 한 번에 뜹니다.

```bash
git clone https://github.com/dev-jsshin/Secret-Box.git
cd Secret-Box

# 1) 환경변수 템플릿 복사
cp .env.example .env

# 2) .env 열어서 반드시 교체
#    - JWT_SECRET: openssl rand -base64 48 로 생성한 값
#    - POSTGRES_PASSWORD: 강한 랜덤 비밀번호

# 3) 빌드 + 실행
docker compose up -d --build

# 4) 상태 확인
docker compose ps
docker compose logs -f
```

**접속:** `https://<호스트-IP>:7444`
- 같은 Mac에서: `https://localhost:7444`
- LAN의 다른 PC에서: `https://192.168.x.x:7444` (호스트 Mac의 LAN IP)

> ⚠️ **최초 접속 시 브라우저가 "안전하지 않은 사이트" 경고**를 띄웁니다.
> self-signed 인증서라 정상입니다. "고급 → 안전하지 않은 사이트로 진행" 누르면 됩니다.
> 인증서는 컨테이너 볼륨에 유지되므로 재빌드해도 동일한 것이 재사용됩니다.

> ⚠️ HTTP가 아닌 **HTTPS**로 접속해야 합니다. WebCrypto API는 secure context에서만 동작합니다.

---

## 2. 개발 모드 — IDE + Vite (라이브 리로드)

기능 개발 시엔 도커 대신 IDE에서 직접 실행이 빠릅니다 (저장하면 즉시 반영).

```bash
# 1) Postgres만 도커로
docker compose up -d postgres

# 2) 백엔드용 env 준비
cp backend/.env.example backend/.env
# backend/.env 열어서 JWT_SECRET 교체
```

**백엔드 (IntelliJ):**
1. `backend/`를 Gradle 프로젝트로 import
2. [EnvFile 플러그인](https://plugins.jetbrains.com/plugin/7861-envfile) 설치 후 IntelliJ 재시작
3. `SecretBoxApplication` Run Configuration → EnvFile 탭에서 `backend/.env` 추가
4. Run → http://localhost:6334 (단일 모드면 6333)

**프론트엔드 (Vite):**
```bash
cp frontend/.env.example frontend/.env.local   # 선택, 포트 커스터마이즈할 때만
cd frontend
npm install
npm run dev    # 최초엔 sudo 비밀번호로 mkcert 시스템 등록
```
→ `https://localhost:7445` (단일 모드면 7444). 브라우저 경고 없음 — mkcert 덕분.

---

## 3. 운영 + 개발 동시 실행 (병렬)

도커 stack(7444)을 안정 운영용으로 계속 띄워두고, 작업 중인 코드는 IDE/Vite(7445)로 별도 띄워서 비교 가능합니다.

| | 운영 (Docker) | 개발 (IDE/Vite) |
|---|---|---|
| 프론트 | 7444 (nginx) | 7445 (Vite) |
| 백엔드 | 6333 (도커 내부 only) | 6334 (IDE) |
| Postgres | 5432 (호스트 노출, **공유**) | 5432 (공유) |

**셋업 (한 번만):**
- `backend/.env` 의 `SERVER_PORT=6334`
- `frontend/.env.local` 에 `VITE_PORT=7445`, `VITE_BACKEND_ORIGIN=http://localhost:6334`
- 두 백엔드의 `JWT_SECRET`을 **같은 값**으로 (안 같으면 토큰 호환 X)

**일상 흐름:**
```bash
# 항상 살아있는 운영
docker compose up -d

# 필요할 때만 시작하는 개발
# → IntelliJ에서 backend run
# → 새 터미널: cd frontend && npm run dev
```

브라우저:
- `https://localhost:7444` — 도커 빌드 (안정)
- `https://localhost:7445` — 작업 중인 코드 (라이브 리로드)

> ⚠️ DB 데이터는 양쪽이 공유합니다 (같은 Postgres). 개발 모드에서 데이터 망가뜨리는 코드가 운영 데이터에도 영향. 진짜 분리하려면 별도 DB 컨테이너 필요.

---

## 4. 코드 수정 후 도커에 반영하기

| 변경 종류 | 명령 | 소요 시간 |
|---|---|---|
| 프론트 코드 (`.tsx`, `.css`) | `docker compose up -d --build frontend` | ~30초 |
| 백엔드 코드 (`.java`) | `docker compose up -d --build backend` | ~1~2분 (Gradle 빌드) |
| 둘 다 | `docker compose up -d --build` | ~2분 |
| DB 마이그레이션 추가 (`V8__*.sql`) | `docker compose up -d --build backend` | 마이그레이션 자동 적용 |
| 의존성 추가 (`package.json`/`build.gradle`) | `docker compose build --no-cache <서비스>` | 캐시 무효화 + 풀 빌드 |
| 환경변수 (`.env`) 변경 | `docker compose up -d` (재빌드 X, env만 다시 주입) | 즉시 |

**확인:**
```bash
docker compose ps              # 모두 'Up' 인지
docker compose logs -f backend # 부팅 에러 잡아내기
```

**완전 초기화 (DB 삭제 포함):**
```bash
docker compose down -v
```

---

## 5. 같은 네트워크의 다른 PC에서 접속

1. 호스트 머신의 IP 확인 (Mac):
   ```bash
   ipconfig getifaddr en0
   ```
2. 다른 PC 브라우저: `https://<호스트-IP>:7444`
3. 인증서 경고 → "고급" → "안전하지 않은 사이트로 진행"
4. 정상 동작

> Mac 방화벽이 7444 포트를 막고 있으면 시스템 환경설정 → 네트워크 → 방화벽에서 들어오는 연결 허용.

---

## 설정 변경

### 포트 변경

| 변경 대상 | 파일 | 키 |
|---|---|---|
| 도커 프론트 호스트 포트 | `.env` | `HOST_PORT` (기본 7444) |
| 도커 Postgres 호스트 포트 | `.env` | `POSTGRES_PORT` (기본 5432) |
| IDE 백엔드 포트 | `backend/.env` | `SERVER_PORT` (기본 6334) |
| Vite dev 포트 | `frontend/.env.local` | `VITE_PORT` (기본 7445) |
| Vite proxy 백엔드 주소 | `frontend/.env.local` | `VITE_BACKEND_ORIGIN` (기본 `http://localhost:6334`) |

### CORS 허용 Origin

`backend/.env` 또는 도커 `.env`의 `APP_CORS_ALLOWED_ORIGIN_PATTERNS`. 콤마 구분, 와일드카드 허용.

```bash
# dev/LAN: 모든 https
APP_CORS_ALLOWED_ORIGIN_PATTERNS=https://*

# 운영: 실제 도메인만
APP_CORS_ALLOWED_ORIGIN_PATTERNS=https://app.example.com,https://www.example.com
```

---

## 자주 발생하는 문제

### 백엔드 컨테이너가 `Restarting (1)` 무한 루프
대부분 `.env`의 `JWT_SECRET`이 비어있는 경우. `docker compose logs backend | tail`에서 `WeakKeyException: 0 bits`가 보이면 확정. `openssl rand -base64 48`로 만든 값을 `.env`에 채우고 `docker compose up -d` 재시도.

### `400 Bad Request` 화면
`http://localhost:7444`로 접속했을 가능성. 반드시 `https://`로.

### `crypto.subtle is undefined`
HTTP로 접속 중. WebCrypto는 secure context(HTTPS)에서만 동작.

### `net::ERR_CERT_AUTHORITY_INVALID`
self-signed 인증서라 정상 경고. "고급 → 진행" 한 번 누르면 됨.

### 프론트가 7444 대신 다른 포트로 뜸 (Vite)
이전 vite 프로세스가 점유 중. 죽이고 재시작:
```bash
lsof -ti:7444 | xargs kill
cd frontend && npm run dev
```

### IDE 백엔드가 DB 연결 실패 (`Connection to localhost:5432 refused`)
도커 Postgres가 안 떠있거나 포트 노출이 안 된 상태:
```bash
docker compose up -d --force-recreate postgres
docker compose ps    # 5432가 호스트로 노출돼야 함
```

### IDE 백엔드 시작 후 `Using generated security password` 경고
정상 — Spring Boot의 무해한 안내 메시지. JWT 필터로 인증을 처리하므로 영향 없음.

### Node 20.9 이하 버전 오류 (`webidl.util.markAsUncloneable is not a function`)
Node 20.18+ 또는 22+로 업그레이드:
```bash
nvm install 22 && nvm use 22
cd frontend && rm -rf node_modules && npm install
```

---

## 주요 기능

- **항목 CRUD** — 카탈로그 기반 등록 (Naver, Google, Kakao 등 30+ 브랜드 자동 매칭). 별칭으로 같은 서비스 여러 계정 구분.
- **항목별 TOTP (2FA 코드)** — RFC 6238. otpauth:// URI 또는 base32 secret 등록 → 카드에서 30초 회전 코드 표시 + 클릭 복사. 툴바 토글로 일괄 마스킹.
- **변경 이력** — 항목 필드별 변경 내역 (읽기 전용 diff).
- **마스터 비밀번호 변경** — 새 KEK로 DEK만 다시 감쌈 (항목 재암호화 X). 다른 모든 세션 강제 로그아웃.
- **자동 잠금** — idle 시 메모리 DEK 폐기 → 잠금 화면. 마스터 비번만으로 풀림 (서버 호출 0). 5/15/30분/안 함 + "지금 잠그기".
- **마스터 로그인 2FA (TOTP)** — Google/MS Authenticator 호환. QR 등록 + 두 연속 코드 검증. 32자 single-use recovery code (사용 시 2FA 자동 비활성화).
- **활성 세션 관리** — 기기별 세션 목록, 개별/일괄 폐기. Device ID로 같은 기기 재로그인 시 row 누적 방지.
- **Refresh token 회전** — 30일 유지, 사용 시마다 새 토큰 + 이전 토큰 폐기 (재사용 감지).

---

## 디렉토리 구조

```
.
├── backend/                  Spring Boot 3 + Java 21
│   ├── Dockerfile            도커 빌드 (multi-stage Gradle → JRE)
│   ├── .env.example          IDE 모드용 템플릿
│   └── src/main/
│       ├── java/com/secretbox/
│       │   ├── auth/         가입/로그인/refresh, JWT, 세션, TotpCodec
│       │   ├── user/         User + 마스터 비번 변경, 2FA, 활성 세션
│       │   ├── vault/        VaultItem + VaultItemHistory
│       │   ├── catalog/      서비스 카탈로그 (브랜드 메타)
│       │   ├── config/       Security, CORS
│       │   └── common/       전역 예외, ApiError
│       └── resources/
│           ├── application.yml
│           └── db/migration/  Flyway SQL (V1~V7)
├── frontend/                 React 18 + Vite + TS
│   ├── Dockerfile            Vite build → nginx alpine
│   ├── nginx.conf            정적 + /api 프록시 + HTTPS
│   ├── docker-entrypoint.sh  self-signed 인증서 자동 생성
│   ├── .env.example          Vite dev 템플릿
│   └── src/
│       ├── pages/            Register, Login, Vault, Settings
│       ├── components/       Logo, FormField, Modal, AlertModal,
│       │   │                 LockScreen, TwoFactorCard, ...
│       │   └── vault/        Avatar, AddEditItemModal, ItemHistoryModal,
│       │                     CatalogPicker, TotpDisplay
│       ├── hooks/            useIdleLock
│       ├── lib/              totp, deviceId, passwordTools
│       ├── crypto/           Argon2 + AES-GCM + base64
│       ├── api/              client (refresh 자동 회전), auth, users,
│       │                     vault, catalog
│       └── store/            zustand — session (DEK 메모리만),
│                             lockSettings (자동 잠금 설정)
├── docker-compose.yml        Postgres + backend + frontend 통합
├── .env.example              도커 통합 모드 템플릿
└── LICENSE                   MIT
```

---

## 개발 상태

- ✅ Zero-knowledge architecture (KEK/DEK, Argon2id + AES-256-GCM)
- ✅ 회원가입 / 로그인 (refresh token 회전)
- ✅ 비밀번호 항목 CRUD (카탈로그 기반)
- ✅ 항목별 TOTP (2FA 코드) — RFC 6238
- ✅ 항목별 변경 이력
- ✅ 마스터 비밀번호 변경
- ✅ 자동 잠금 + 잠금 화면 (서버 호출 없는 client-side unlock)
- ✅ 활성 세션 목록 + 개별/일괄 폐기 + 기기 dedup
- ✅ 마스터 로그인 2FA (TOTP) + single-use recovery
- ✅ Docker 통합 self-host (compose up + nginx HTTPS)
- ⬜ Rate limit (배포 단계에서)
- ⬜ 모바일 반응형 폴리싱
- ⬜ 즐겨찾기 / 정렬

---

## License

[MIT](LICENSE) — 자유롭게 사용·수정·배포 가능.

## Credits

Crafted by **dev-jsshin** · **신준섭**
