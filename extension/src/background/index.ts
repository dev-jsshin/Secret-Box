// Service Worker 진입점 — 메시지 라우팅 + 세션 만료 시 정리.
// MV3 SW는 idle 후 죽었다가 메시지 도착 시 부활. 모든 상태는 storage 또는 가벼운
// 메모리 캐시(vault.ts)에 두고, 메시지 핸들러는 항상 storage에서 회복 가능하도록 작성.

import type { SbMessage, SbResponse, SbState, PongData } from '../shared/messages';
import { getSessionState } from '../shared/sessionStore';
import { lock, unlock, unlock2fa, getLastEmail, getPendingEmail } from './auth';
import { listSummaries, refreshVault, getItemPlaintext, clearVaultCache } from './vault';
import { setSessionExpiredHandler } from './api';
import { getSettings, setSettings, DEV_DEFAULT_BACKEND_URL } from '../shared/settings';
import { recordLastFill, getLastFillFor } from './lastFill';
import { generateTotp } from '@sb/lib/totp';
import { pickBestTier } from '../shared/hostMatch';

chrome.runtime.onInstalled.addListener(async (d) => {
  console.log('[SecretBox/bg] installed', d.reason);
  // DEV: install/update 양쪽에서 LAN 백엔드 URL을 강제 시드. 사용자가 popup에서
  // 잘못 저장해도 확장 reload만 하면 올바른 값으로 자동 복구. Day 7 배포 전에 제거.
  await setSettings({ backendUrl: DEV_DEFAULT_BACKEND_URL });

  // 확장 reload/update 시점에 이미 떠 있던 탭에는 이전 content.js가 살아있음 →
  // 새 메시지(CONTENT_STATE_CHANGED 등) 수신 못함. 해결: 강제 재주입.
  // chrome.scripting 권한 필요 (manifest에 이미 있음).
  if (d.reason === 'install' || d.reason === 'update') {
    await reinjectAllTabs();
  }
});

async function reinjectAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch {
        // chrome://, file://, store 페이지 등 — 정상적인 거부
      }
    }),
  );
}

setSessionExpiredHandler(async () => {
  console.log('[SecretBox/bg] session expired — locking');
  await lock();
  clearVaultCache();
  await broadcastStateChanged();
});

// chrome.storage.session은 content script에 onChanged 이벤트를 안 흘려보낸다(MV3 기본).
// 따라서 잠금/해제가 일어났을 때 BG가 명시적으로 모든 탭에 알려준다.
async function broadcastStateChanged() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { kind: 'CONTENT_STATE_CHANGED' });
      } catch {
        // content script가 없는 탭(chrome://, 새 탭 페이지 등) — 무시
      }
    }),
  );
}

function safeHost(url: string): string | null {
  try { return new URL(url).host; } catch { return null; }
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
        if (out.phase === 'unlocked') await broadcastStateChanged();
        return { ok: true, data: out };
      }

      case 'UNLOCK_2FA': {
        const out = await unlock2fa(msg.code);
        if (out.phase === 'unlocked') await broadcastStateChanged();
        return { ok: true, data: out };
      }

      case 'LOCK':
        await lock();
        clearVaultCache();
        await broadcastStateChanged();
        return { ok: true, data: null };

      case 'LIST_ITEMS':
        // force면 캐시 무시하고 새로 가져옴 — popup 마운트/수동 새로고침 케이스
        return { ok: true, data: msg.force ? await refreshVault() : await listSummaries() };

      case 'GET_ITEM_PLAINTEXT':
        return { ok: true, data: await getItemPlaintext(msg.id) };

      case 'CONTENT_LIST_MATCHES': {
        const all = await listSummaries();
        // 칩은 가장 높은 등급의 매칭만 보여주기 — 회사 인트라 도메인에서 형제 서브도메인 항목들이
        // 우르르 떠는 것 방지. exact가 있으면 exact만, 없으면 suffix만, 없으면 root만.
        const matched = pickBestTier(all, msg.host);
        return { ok: true, data: matched };
      }

      case 'FILL_ACTIVE_TAB': {
        const item = await getItemPlaintext(msg.id);
        if (!item) return { ok: false, error: '항목을 찾을 수 없음' };
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) return { ok: false, error: '활성 탭 없음' };
        const host = safeHost(tab.url);
        try {
          await chrome.tabs.sendMessage(tab.id, {
            kind: 'CONTENT_FILL',
            username: item.username,
            password: item.password,
          });
        } catch {
          return { ok: false, error: '이 페이지엔 자동 채우기를 적용할 수 없음' };
        }
        if (host) await recordLastFill(item.id, host);
        return { ok: true, data: null };
      }

      case 'RECORD_LAST_FILL':
        await recordLastFill(msg.id, msg.host);
        return { ok: true, data: null };

      case 'GET_AUTO_TOTP': {
        const settings = await getSettings();
        if (!settings.totpAutofill) return { ok: true, data: null };

        const last = await getLastFillFor(msg.host);
        if (!last) return { ok: true, data: null };

        const item = await getItemPlaintext(last.itemId);
        if (!item?.totpSecret) return { ok: true, data: null };

        const code = await generateTotp(item.totpSecret);
        return { ok: true, data: { code, autoSubmit: settings.totpAutoSubmit } };
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
