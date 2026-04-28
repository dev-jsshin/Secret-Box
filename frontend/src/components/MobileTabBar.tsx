import { Link } from 'react-router-dom';

import './MobileTabBar.css';
import type { SidebarSection } from './Sidebar';

interface MobileTabBarProps {
  current: SidebarSection;
}

/**
 * 모바일(≤640) 하단 고정 탭바 — 로그인 / 메모 / 설정 3개.
 * iOS notch 안전영역 자동 보정.
 */
export default function MobileTabBar({ current }: MobileTabBarProps) {
  return (
    <nav className="mtb" aria-label="모바일 내비게이션">
      <Link
        to="/vault"
        className={'mtb__tab' + (current === 'login' ? ' is-active' : '')}
      >
        <KeyIcon />
        <span className="mtb__label">패스워드</span>
      </Link>
      <Link
        to="/vault?type=note"
        className={'mtb__tab' + (current === 'note' ? ' is-active' : '')}
      >
        <NoteIcon />
        <span className="mtb__label">메모</span>
      </Link>
      <Link
        to="/settings"
        className={'mtb__tab' + (current === 'settings' ? ' is-active' : '')}
      >
        <SettingsIcon />
        <span className="mtb__label">설정</span>
      </Link>
    </nav>
  );
}

// ---------- inline icons ----------
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <line x1="10.83" y1="12.17" x2="20" y2="3" />
      <line x1="17" y1="6" x2="20" y2="9" />
      <line x1="14" y1="9" x2="17" y2="12" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
