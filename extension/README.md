# SecretBox Extension

Chrome 확장(MV3). zero-knowledge vault를 브라우저 자동완성에 연결한다.

## 개발

```bash
cd extension
npm install
npm run build       # dist/ 생성
npm run dev         # 변경 시 재빌드 (watch)
```

빌드 결과는 `dist/`. 테스트 로딩:

1. Chrome → `chrome://extensions`
2. 우상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드합니다** → `extension/dist` 선택
4. 툴바에 SecretBox 아이콘이 뜨면 성공. 아무 페이지 가서 DevTools 콘솔 보면 `[SecretBox/content] ... bg ack: ...` 로그.

## 구조

| 파트 | 진입점 | 역할 |
|---|---|---|
| Popup | `src/popup/` | 잠금 해제 UI, 항목 검색 |
| Background SW | `src/background/index.ts` | 메시지 라우팅, KEK 보관, 백엔드 호출 |
| Content Script | `src/content/index.ts` | 페이지 DOM 폼 감지/자동완성 주입 |
| Offscreen | `src/offscreen/` | Argon2 wasm 같은 무거운 작업 위임 |

각 파트는 다른 프로세스라 변수 공유 X. 통신은 `src/shared/messages.ts`의 typed 메시지로만.

frontend의 crypto/totp 모듈은 path alias로 재사용:
- `@sb/crypto/*` → `frontend/src/crypto/*`
- `@sb/lib/*` → `frontend/src/lib/*`

## 빌드 노트

`npm run build`는 두 번 vite를 호출함:
1. `vite.config.ts` — popup/offscreen(HTML) + background(ESM)
2. `vite.content.config.ts` — content script를 IIFE 단일 파일로 (MV3 content script는 ES 모듈 로드 불가)
