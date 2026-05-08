// 모든 popup ↔ background ↔ offscreen 메시지의 단일 소스. 각 파트가 import해서 동일한
// 페이로드 타입을 공유하도록 강제 — 메시지 채널은 typed가 아니라 런타임 in/out이라
// 한 곳에서 안 잡으면 디버깅이 끔찍해짐.
//
// 응답 형태는 모두 {ok: true, data} 또는 {ok: false, error}로 통일. 이렇게 묶으면
// throw 대신 응답 객체로 에러를 옮길 수 있어 sendResponse 콜백 흐름과 잘 맞음.

export type SbMessage =
  // 공통
  | { kind: 'PING'; from: 'popup' | 'content' | 'offscreen' }
  // popup ↔ background
  | { kind: 'GET_STATE' }
  | { kind: 'UNLOCK'; email: string; password: string }
  | { kind: 'UNLOCK_2FA'; code: string }
  | { kind: 'LOCK' }
  | { kind: 'LIST_ITEMS'; force?: boolean }      // popup 마운트 시 force=true로 항상 fresh
  | { kind: 'GET_ITEM_PLAINTEXT'; id: string }
  // popup → background → 활성 탭 content
  | { kind: 'FILL_ACTIVE_TAB'; id: string }
  // content → background
  | { kind: 'CONTENT_LIST_MATCHES'; host: string }
  | { kind: 'RECORD_LAST_FILL'; id: string; host: string }
  | { kind: 'GET_AUTO_TOTP'; host: string }      // 응답: {code, autoSubmit} | null
  // background → content (chrome.tabs.sendMessage)
  | { kind: 'CONTENT_FILL'; username?: string; password?: string }
  | { kind: 'CONTENT_STATE_CHANGED' }   // 잠금/해제 알림 — content가 fresh fetch
  // background ↔ offscreen (Argon2 위임)
  | {
      kind: 'OFFSCREEN_ARGON2';
      passwordB64: string;       // UTF-8 → bytes → base64 — 메시지 직렬화 안전성
      saltB64: string;
      iterations: number;
      memoryKb: number;
      parallelism: number;
    };

export type SbState =
  | { phase: 'locked'; lastEmail: string | null }
  | { phase: 'awaiting-2fa'; email: string }
  | { phase: 'unlocked'; email: string; userId: string };

export type SbResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export function sendMessage<T = unknown>(msg: SbMessage): Promise<SbResponse<T>> {
  return chrome.runtime.sendMessage(msg);
}

// 단순한 PING 답변용 — 문자열 응답 호환.
export type PongData = { kind: 'PONG'; from: 'background' };
