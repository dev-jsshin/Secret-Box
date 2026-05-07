// 확장의 4개 파트(popup, background, content, offscreen)는 다른 프로세스에서 돌고
// chrome.runtime.sendMessage로만 소통한다. 모든 메시지는 한 곳에 typed로 모아서
// 각 파트가 같은 타입을 import하게 한다 — payload 모양이 어긋나 디버깅 지옥에 빠지는
// 가장 흔한 사고를 방지.

export type SbMessage =
  | { kind: 'PING'; from: 'popup' | 'content' | 'offscreen' }
  | { kind: 'PONG'; from: 'background' };

export type SbResponse = { ok: true; data?: unknown } | { ok: false; error: string };

export function sendMessage(msg: SbMessage): Promise<SbResponse> {
  return chrome.runtime.sendMessage(msg);
}
