import { useCallback, useEffect, useReducer } from 'react';
import { LockScreen } from './screens/LockScreen';
import { TwoFactorScreen } from './screens/TwoFactorScreen';
import { ItemsScreen, type PopupItemRow } from './screens/ItemsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { getSettings, isConfigured, setSettings, type SbSettings } from '../shared/settings';
import { sendMessage, type SbState } from '../shared/messages';
import type { ItemSummary } from '../shared/vaultTypes';
import { itemMatches } from '../shared/hostMatch';

// Day 3 — 진짜 백엔드 + KEK + 복호화 흐름. background에서 단일 진실로 GET_STATE / LIST_ITEMS.

type Screen =
  | { kind: 'loading' }
  | { kind: 'needs-config' }
  | { kind: 'locked'; lastEmail: string }
  | { kind: 'awaiting-2fa'; email: string }
  | { kind: 'unlocked'; email: string }
  | { kind: 'settings'; back: 'locked' | 'unlocked' | 'needs-config' };

interface AppState {
  screen: Screen;
  settings: SbSettings | null;
  currentHost: string;
  items: ItemSummary[];
}

type Action =
  | { type: 'INIT'; settings: SbSettings; host: string; bgState: SbState }
  | { type: 'SET_BG_STATE'; bgState: SbState }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'SETTINGS_SAVED'; settings: SbSettings; bgState: SbState }
  | { type: 'SET_ITEMS'; items: ItemSummary[] };

function bgStateToScreen(s: SbState): Screen {
  if (s.phase === 'unlocked') return { kind: 'unlocked', email: s.email };
  if (s.phase === 'awaiting-2fa') return { kind: 'awaiting-2fa', email: s.email };
  return { kind: 'locked', lastEmail: s.lastEmail ?? '' };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT': {
      const screen: Screen = isConfigured(action.settings)
        ? bgStateToScreen(action.bgState)
        : { kind: 'needs-config' };
      return { ...state, settings: action.settings, currentHost: action.host, screen };
    }
    case 'SET_BG_STATE':
      return { ...state, screen: bgStateToScreen(action.bgState) };
    case 'OPEN_SETTINGS': {
      const back = state.screen.kind === 'unlocked'
        ? 'unlocked'
        : state.screen.kind === 'needs-config' ? 'needs-config' : 'locked';
      return { ...state, screen: { kind: 'settings', back } };
    }
    case 'CLOSE_SETTINGS': {
      const back = state.screen.kind === 'settings' ? state.screen.back : 'locked';
      if (back === 'unlocked') return { ...state, screen: { kind: 'unlocked', email: '' } };
      if (back === 'needs-config') return { ...state, screen: { kind: 'needs-config' } };
      return { ...state, screen: { kind: 'locked', lastEmail: '' } };
    }
    case 'SETTINGS_SAVED': {
      const screen = isConfigured(action.settings)
        ? bgStateToScreen(action.bgState)
        : { kind: 'needs-config' as const };
      return { ...state, settings: action.settings, screen };
    }
    case 'SET_ITEMS':
      return { ...state, items: action.items };
  }
}

const INITIAL: AppState = {
  screen: { kind: 'loading' },
  settings: null,
  currentHost: '',
  items: [],
};

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const refreshState = useCallback(async () => {
    const r = await sendMessage<SbState>({ kind: 'GET_STATE' });
    if (r.ok) dispatch({ type: 'SET_BG_STATE', bgState: r.data });
  }, []);

  useEffect(() => {
    (async () => {
      const [s, host, bg] = await Promise.all([
        getSettings(),
        getActiveTabHost(),
        sendMessage<SbState>({ kind: 'GET_STATE' }),
      ]);
      dispatch({
        type: 'INIT',
        settings: s,
        host,
        bgState: bg.ok ? bg.data : { phase: 'locked', lastEmail: null },
      });
    })();
  }, []);

  // 잠금 해제된 직후 항목 fetch — popup 열 때마다 force=true로 vault 본체 변경사항 즉시 반영
  useEffect(() => {
    if (state.screen.kind !== 'unlocked') return;
    let cancelled = false;
    (async () => {
      const r = await sendMessage<ItemSummary[]>({ kind: 'LIST_ITEMS', force: true });
      if (!cancelled && r.ok) dispatch({ type: 'SET_ITEMS', items: r.data });
    })();
    return () => { cancelled = true; };
  }, [state.screen.kind]);

  const refreshItems = useCallback(async () => {
    const r = await sendMessage<ItemSummary[]>({ kind: 'LIST_ITEMS', force: true });
    if (r.ok) dispatch({ type: 'SET_ITEMS', items: r.data });
  }, []);

  if (state.screen.kind === 'loading' || !state.settings) {
    return <div className="screen" />;
  }

  if (state.screen.kind === 'needs-config') {
    return (
      <SettingsScreen
        settings={state.settings}
        isLocked={true}
        onSave={async (next) => {
          const saved = await setSettings(next);
          const bg = await sendMessage<SbState>({ kind: 'GET_STATE' });
          dispatch({
            type: 'SETTINGS_SAVED',
            settings: saved,
            bgState: bg.ok ? bg.data : { phase: 'locked', lastEmail: null },
          });
        }}
        onBack={() => { /* 첫 실행 — 닫기 없음 */ }}
        onLockNow={() => { /* 의미 없음 */ }}
      />
    );
  }

  if (state.screen.kind === 'settings') {
    return (
      <SettingsScreen
        settings={state.settings}
        isLocked={state.screen.back === 'locked' || state.screen.back === 'needs-config'}
        onSave={async (next) => {
          const saved = await setSettings(next);
          const bg = await sendMessage<SbState>({ kind: 'GET_STATE' });
          dispatch({
            type: 'SETTINGS_SAVED',
            settings: saved,
            bgState: bg.ok ? bg.data : { phase: 'locked', lastEmail: null },
          });
        }}
        onBack={() => dispatch({ type: 'CLOSE_SETTINGS' })}
        onLockNow={async () => {
          await sendMessage({ kind: 'LOCK' });
          await refreshState();
        }}
      />
    );
  }

  if (state.screen.kind === 'locked') {
    return (
      <LockScreen
        hostHint={shortHost(state.settings.backendUrl)}
        initialEmail={state.screen.lastEmail}
        onUnlock={async (email, password) => {
          const r = await sendMessage<{ phase: 'unlocked' | 'awaiting-2fa' }>({
            kind: 'UNLOCK',
            email,
            password,
          });
          if (!r.ok) throw new Error(r.error);
          await refreshState();
        }}
        onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
      />
    );
  }

  if (state.screen.kind === 'awaiting-2fa') {
    return (
      <TwoFactorScreen
        email={state.screen.email}
        onSubmit={async (code) => {
          const r = await sendMessage({ kind: 'UNLOCK_2FA', code });
          if (!r.ok) throw new Error(r.error);
          await refreshState();
        }}
        onCancel={async () => {
          await sendMessage({ kind: 'LOCK' });
          await refreshState();
        }}
      />
    );
  }

  // unlocked
  const rows: PopupItemRow[] = state.items.map((i) => ({
    id: i.id,
    name: i.name,
    username: i.username,
    url: i.url,
    catalogSlug: i.catalogSlug,
    matchedHost: !!state.currentHost && itemMatches(i, state.currentHost),
  }));

  return (
    <ItemsScreen
      items={rows}
      currentHost={state.currentHost}
      onPickItem={async (id) => {
        const r = await sendMessage({ kind: 'FILL_ACTIVE_TAB', id });
        if (!r.ok) {
          console.warn('[SecretBox] fill 실패:', r.error);
          return;
        }
        window.close();   // 채우기 성공 후 popup 자동 닫기 — 채워진 화면이 바로 보이도록
      }}
      onLock={async () => {
        await sendMessage({ kind: 'LOCK' });
        await refreshState();
      }}
      onRefresh={refreshItems}
      onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
    />
  );
}

async function getActiveTabHost(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return '';
    return new URL(tab.url).host;
  } catch {
    return '';
  }
}

function shortHost(backendUrl: string): string {
  if (!backendUrl) return '';
  try { return new URL(backendUrl).host; } catch { return backendUrl; }
}
