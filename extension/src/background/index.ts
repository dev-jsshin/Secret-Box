// Service Worker 진입점 — 메시지 라우팅 + 세션 만료 시 정리.
// MV3 SW는 idle 후 죽었다가 메시지 도착 시 부활. 모든 상태는 storage 또는 가벼운
// 메모리 캐시(vault.ts)에 두고, 메시지 핸들러는 항상 storage에서 회복 가능하도록 작성.

import type { SbMessage, SbResponse, SbState, PongData } from '../shared/messages';
import { getSessionState } from '../shared/sessionStore';
import { lock, unlock, unlock2fa, getLastEmail, getPendingEmail } from './auth';
import { listSummaries, getItemPlaintext, clearVaultCache } from './vault';
import { setSessionExpiredHandler } from './api';
import { setSettings, DEV_DEFAULT_BACKEND_URL } from '../shared/settings';

chrome.runtime.onInstalled.addListener(async (d) => {
  console.log('[SecretBox/bg] installed', d.reason);
  // DEV: install/update 양쪽에서 LAN 백엔드 URL을 강제 시드. 사용자가 popup에서
  // 잘못 저장해도 확장 reload만 하면 올바른 값으로 자동 복구. Day 7 배포 전에 제거.
  await setSettings({ backendUrl: DEV_DEFAULT_BACKEND_URL });
});

setSessionExpiredHandler(async () => {
  console.log('[SecretBox/bg] session expired — locking');
  await lock();
  clearVaultCache();
});

function hostMatches(currentHost: string, itemUrl: string | undefined): boolean {
  if (!itemUrl) return false;
  try {
    const itemHost = new URL(itemUrl).host;
    return itemHost === currentHost ||
      currentHost.endsWith('.' + itemHost) ||
      itemHost.endsWith('.' + currentHost);
  } catch {
    return false;
  }
}

async function getState(): Promise<SbState> {
  // 진행 중인 2FA가 있으면 그 단계
  const pendingEmail = await getPendingEmail();
  if (pendingEmail) return { phase: 'awaiting-2fa', email: pendingEmail };

  const session = await getSessionState();
  if (session) {
    return { phase: 'unlocked', email: session.email, userId: session.userId };
  }

  return { phase: 'locked', lastEmail: await getLastEmail() };
}

// 핸들러 — 모든 분기는 try/catch로 감싸 응답 객체로 통일.
async function dispatch(msg: SbMessage): Promise<SbResponse> {
  try {
    switch (msg.kind) {
      case 'PING':
        return { ok: true, data: { kind: 'PONG', from: 'background' } satisfies PongData };

      case 'GET_STATE':
        return { ok: true, data: await getState() };

      case 'UNLOCK': {
        const out = await unlock(msg.email, msg.password);
        return { ok: true, data: out };
      }

      case 'UNLOCK_2FA': {
        const out = await unlock2fa(msg.code);
        return { ok: true, data: out };
      }

      case 'LOCK':
        await lock();
        clearVaultCache();
        return { ok: true, data: null };

      case 'LIST_ITEMS':
        return { ok: true, data: await listSummaries() };

      case 'GET_ITEM_PLAINTEXT':
        return { ok: true, data: await getItemPlaintext(msg.id) };

      case 'CONTENT_LIST_MATCHES': {
        const all = await listSummaries();
        const matched = all.filter((it) => hostMatches(msg.host, it.url));
        return { ok: true, data: matched };
      }

      case 'FILL_ACTIVE_TAB': {
        const item = await getItemPlaintext(msg.id);
        if (!item) return { ok: false, error: '항목을 찾을 수 없음' };
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return { ok: false, error: '활성 탭 없음' };
        try {
          await chrome.tabs.sendMessage(tab.id, {
            kind: 'CONTENT_FILL',
            username: item.username,
            password: item.password,
          });
        } catch (err) {
          // content script가 그 페이지에 안 주입된 경우 (chrome:// 등)
          return { ok: false, error: '이 페이지엔 자동 채우기를 적용할 수 없음' };
        }
        return { ok: true, data: null };
      }

      case 'CONTENT_FILL':
        // BG는 발송자 — 받는 쪽은 content. BG가 받으면 무시.
        return { ok: false, error: 'CONTENT_FILL은 content가 받습니다' };

      case 'OFFSCREEN_ARGON2':
        // background는 이 메시지 직접 처리하지 않음 — offscreen이 받음.
        // 메시지가 background에 먼저 도착할 수 있어 false 반환으로 흘려보냄.
        return { ok: false, error: 'OFFSCREEN_ARGON2는 offscreen이 처리합니다' };

      default:
        return { ok: false, error: `unknown kind: ${(msg as { kind: string }).kind}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    return { ok: false, error: message, code };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: SbMessage, _sender, sendResponse: (r: SbResponse) => void) => {
    // OFFSCREEN_ARGON2는 offscreen 리스너가 채간다 — 여기서 답하지 않음.
    if (msg.kind === 'OFFSCREEN_ARGON2') return false;

    dispatch(msg).then(sendResponse);
    return true; // 비동기 응답 채널 유지
  },
);
