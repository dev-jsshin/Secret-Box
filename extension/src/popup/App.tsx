import { useEffect, useReducer } from 'react';
import { LockScreen } from './screens/LockScreen';
import { ItemsScreen, type PopupItemRow } from './screens/ItemsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { getSettings, isConfigured, setSettings, type SbSettings } from '../shared/settings';

// Day 2 — UI 골격 + 상태 머신만 완성. 실제 KEK 파생/저장은 Day 3에서 연결.
// "unlock"은 지금은 로컬 상태만 바꾸는 mock. 항목도 데모 데이터.

type Screen = 'loading' | 'needs-config' | 'locked' | 'unlocked' | 'settings';

interface State {
  screen: Screen;
  settings: SbSettings | null;
  prevScreen: Screen | null; // settings에서 닫을 때 어디로 돌아갈지
  currentHost: string;
}

type Action =
  | { type: 'INIT'; settings: SbSettings; host: string }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'SETTINGS_SAVED'; settings: SbSettings }
  | { type: 'UNLOCKED' }
  | { type: 'LOCK' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT': {
      const next: Screen = isConfigured(action.settings) ? 'locked' : 'needs-config';
      return { ...state, settings: action.settings, screen: next, currentHost: action.host };
    }
    case 'OPEN_SETTINGS':
      return { ...state, prevScreen: state.screen, screen: 'settings' };
    case 'CLOSE_SETTINGS':
      return { ...state, screen: state.prevScreen ?? 'locked', prevScreen: null };
    case 'SETTINGS_SAVED': {
      // needs-config 상태에서 저장 → locked로 진입
      const next: Screen = state.screen === 'settings' && state.prevScreen
        ? state.prevScreen
        : isConfigured(action.settings) ? 'locked' : 'needs-config';
      return { ...state, settings: action.settings, screen: next, prevScreen: null };
    }
    case 'UNLOCKED':
      return { ...state, screen: 'unlocked' };
    case 'LOCK':
      return { ...state, screen: 'locked' };
  }
}

const INITIAL: State = {
  screen: 'loading',
  settings: null,
  prevScreen: null,
  currentHost: '',
};

const MOCK_ITEMS: PopupItemRow[] = [
  { id: '1', name: 'GitHub', username: 'sinjunseob', url: 'https://github.com', catalogSlug: 'github', matchedHost: true },
  { id: '2', name: 'Google', username: 'tlswnstjq001@gmail.com', url: 'https://accounts.google.com', catalogSlug: 'google', matchedHost: false },
  { id: '3', name: 'Notion', username: 'me@example.com', url: 'https://www.notion.so', catalogSlug: 'notion', matchedHost: false },
];

export function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    (async () => {
      const [s, host] = await Promise.all([getSettings(), getActiveTabHost()]);
      dispatch({ type: 'INIT', settings: s, host });
    })();
  }, []);

  if (state.screen === 'loading' || !state.settings) {
    return <div className="screen" />;
  }

  // 첫 실행 — 백엔드 URL 입력 강제
  if (state.screen === 'needs-config') {
    return (
      <SettingsScreen
        settings={state.settings}
        isLocked={true}
        onSave={async (next) => {
          const saved = await setSettings(next);
          dispatch({ type: 'SETTINGS_SAVED', settings: saved });
        }}
        onBack={() => { /* needs-config에선 닫기 없음 */ }}
        onLockNow={() => { /* 잠금 상태 자체에서는 의미 없음 */ }}
      />
    );
  }

  if (state.screen === 'settings') {
    return (
      <SettingsScreen
        settings={state.settings}
        isLocked={state.prevScreen === 'locked'}
        onSave={async (next) => {
          const saved = await setSettings(next);
          dispatch({ type: 'SETTINGS_SAVED', settings: saved });
        }}
        onBack={() => dispatch({ type: 'CLOSE_SETTINGS' })}
        onLockNow={() => dispatch({ type: 'LOCK' })}
      />
    );
  }

  if (state.screen === 'locked') {
    return (
      <LockScreen
        hostHint={shortHost(state.settings.backendUrl)}
        onUnlock={async (_password) => {
          // Day 3에서 Argon2 + chrome.storage.session으로 교체.
          // 지금은 잠시 await로 UX 확인.
          await new Promise((r) => setTimeout(r, 250));
          dispatch({ type: 'UNLOCKED' });
        }}
        onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
      />
    );
  }

  // unlocked
  const matchedItems = MOCK_ITEMS.map((it) => ({
    ...it,
    matchedHost: !!state.currentHost && (it.url ?? '').includes(state.currentHost),
  }));
  return (
    <ItemsScreen
      items={matchedItems}
      currentHost={state.currentHost}
      onPickItem={(id) => {
        // Day 4에서 content script로 자동 채우기. 지금은 콘솔 로그만.
        console.log('[SecretBox] pick item', id);
      }}
      onLock={() => dispatch({ type: 'LOCK' })}
      onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
    />
  );
}

async function getActiveTabHost(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return '';
    const u = new URL(tab.url);
    return u.host;
  } catch {
    return '';
  }
}

function shortHost(backendUrl: string): string {
  if (!backendUrl) return '';
  try {
    const u = new URL(backendUrl);
    return u.host;
  } catch {
    return backendUrl;
  }
}
