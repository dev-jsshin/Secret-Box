// Content Script — 페이지 DOM 상에서 폼 감지 + 칩 표시 + 자동 채우기.
// background와 메시지로만 통신, KEK/평문 비번은 채우는 순간만 메모리에 떴다 사라진다.
//
// 동작 흐름:
//   1) DOM ready 시 detectForms()로 password input + username 후보 찾음
//   2) 첫 password input에 칩 attach
//   3) 칩 클릭 시 (CONTENT_LIST_MATCHES, host) → 매칭 항목 받아 드롭다운
//   4) 항목 선택 시 GET_ITEM_PLAINTEXT(id) → fillForm()
//   5) BG가 popup → tabs.sendMessage(CONTENT_FILL) 보낼 때도 동일 fill 수행
//
// SPA 페이지(github 등)는 라우팅 후 폼이 새로 마운트됨 → MutationObserver로 재탐지.

import { detectForms, type DetectedForm } from './formDetect';
import { createChip } from './chip';
import { fillForm } from './fill';
import type { SbMessage, SbResponse, SbState } from '../shared/messages';
import type { ItemSummary, ItemPlaintext } from '../shared/vaultTypes';

const send = <T = unknown>(msg: SbMessage): Promise<SbResponse<T>> =>
  chrome.runtime.sendMessage(msg);

let activeForm: DetectedForm | null = null;
let isLocked = true;

const chip = createChip({
  isLocked: () => isLocked,
  onOpenSettings: () => { /* 칩 자체에선 열지 않음 */ },
  onPick: async (id) => {
    const r = await send<ItemPlaintext | null>({ kind: 'GET_ITEM_PLAINTEXT', id });
    if (!r.ok || !r.data) return;
    if (!activeForm) return;
    fillForm({
      username: r.data.username,
      password: r.data.password,
      passwordEl: activeForm.passwordEl,
      usernameEl: activeForm.usernameEl,
    });
  },
});

async function refreshState() {
  const r = await send<SbState>({ kind: 'GET_STATE' });
  isLocked = !(r.ok && r.data.phase === 'unlocked');
}

async function refreshMatches() {
  if (isLocked) {
    chip.setMatches([]);
    return;
  }
  const r = await send<ItemSummary[]>({
    kind: 'CONTENT_LIST_MATCHES',
    host: location.host,
  });
  if (r.ok) chip.setMatches(r.data);
}

function rescan() {
  const next = detectForms();
  // 동일한 password input이 그대로 있으면 유지
  const sameAnchor = next.length > 0 && activeForm?.passwordEl === next[0].passwordEl;

  if (next.length === 0) {
    activeForm = null;
    chip.detach();
    return;
  }

  // 첫 password input을 우선 — 다중 폼 페이지는 후속 작업
  activeForm = next[0];
  if (!sameAnchor) chip.attachTo(activeForm.passwordEl);
}

(async () => {
  await refreshState();
  rescan();
  await refreshMatches();
  console.log(
    '[SecretBox/content]', location.host,
    '· locked:', isLocked,
    '· form:', activeForm ? 'detected' : 'none',
  );
})();

// SPA 라우팅 / 늦게 로드되는 폼 대응
const observer = new MutationObserver(() => {
  // 너무 자주 호출되지 않도록 소단위 디바운스
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    rescan();
  }, 150);
});
let debounceTimer: number | null = null;
observer.observe(document.documentElement, { childList: true, subtree: true });

// background → 활성 탭 fill 메시지 수신
chrome.runtime.onMessage.addListener(
  (msg: SbMessage, _sender, sendResponse: (r: SbResponse) => void) => {
    if (msg.kind === 'CONTENT_FILL') {
      // 활성 폼 없으면 새로 스캔해서 잡아본다
      if (!activeForm) rescan();
      if (!activeForm) {
        sendResponse({ ok: false, error: '이 페이지에서 입력 폼을 못 찾음' });
        return false;
      }
      fillForm({
        username: msg.username,
        password: msg.password,
        passwordEl: activeForm.passwordEl,
        usernameEl: activeForm.usernameEl,
      });
      sendResponse({ ok: true, data: null });
      return false; // 동기 응답
    }
    return false;
  },
);

// background 상태 변경 알림이 별도로 없으니, 페이지가 다시 보일 때마다 동기화
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await refreshState();
    await refreshMatches();
  }
});
