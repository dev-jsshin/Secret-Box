// Offscreen Document — service worker는 DOM이 없어 일부 라이브러리(특히 wasm 초기화에서
// 환경 가정이 까다로운 것들)가 안정적으로 안 돌 수 있다. hash-wasm은 SW에서도 작동하지만
// MV3 환경에서 fetch 캐시/CSP 이슈로 cold start 실패 케이스가 보고된 바 있어 offscreen에
// 분리해두면 안전. 또한 향후 다른 무거운 작업(WebAuthn 보조, 큰 import 파서)을 동일 컨텍스트에
// 추가하기 좋다.
//
// MV3 offscreen은 한 확장당 하나만 존재 가능 — 이미 생성됐는지 체크 후 ensureOffscreen.

const OFFSCREEN_PATH = 'src/offscreen/index.html';

export async function ensureOffscreen(): Promise<void> {
  // hasDocument는 offscreen API의 일부 — 이미 떠 있으면 skip
  // 일부 Chrome 버전(116+)에서는 chrome.offscreen.hasDocument 대신
  // chrome.runtime.getContexts로 확인하는 패턴이 권장됨.
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification: 'Argon2id KDF derivation for master password unlock',
  });
}

export async function callOffscreenArgon2(args: {
  passwordB64: string;
  saltB64: string;
  iterations: number;
  memoryKb: number;
  parallelism: number;
}): Promise<string> {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({
    kind: 'OFFSCREEN_ARGON2',
    ...args,
  });
  if (!res || res.ok !== true) {
    throw new Error(res?.error ?? 'Argon2 offscreen 응답 실패');
  }
  return res.data as string; // KEK base64
}
