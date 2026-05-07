// Service Worker — 확장의 "두뇌". MV3에선 idle ~30초 후 죽고 메시지 도착 시 부활한다.
// 따라서 메모리에 든 상태(KEK 등)는 chrome.storage.session에 두는 게 원칙.
// Day 1 스켈레톤은 ping/pong + 설치 로그까지만.

import type { SbMessage, SbResponse } from '../shared/messages';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SecretBox] installed', details.reason);
});

chrome.runtime.onMessage.addListener(
  (msg: SbMessage, _sender, sendResponse: (r: SbResponse) => void) => {
    if (msg.kind === 'PING') {
      sendResponse({ ok: true, data: { kind: 'PONG', from: 'background' } });
      return; // 동기 응답 — 채널 유지 X
    }
    sendResponse({ ok: false, error: `unknown kind: ${(msg as { kind: string }).kind}` });
  },
);
