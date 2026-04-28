import { Link } from 'react-router-dom';

import Logo from './Logo';

import './Sidebar.css';

export type SidebarSection = 'login' | 'note' | 'settings';

interface SidebarProps {
  current: SidebarSection;
  counts: { login: number; note: number };
  email: string;
  onLogout: () => void;
}

/**
 * 데스크톱(≥920) 220px 풀, 태블릿(768~919) 64px 아이콘 전용.
 * 모바일(≤640)에선 display:none — MobileTabBar가 대신 등장.
 */
export default function Sidebar({ current, counts, email, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="메인 내비게이션">
      <div className="sidebar__brand">
        <Logo size={26} />
        <span className="sidebar__wordmark">SecretBox</span>
      </div>

      <nav className="sidebar__nav">
        <span className="sidebar__sectionLabel">보관함</span>
        <ul className="sidebar__navList">
          <li>
            <Link
              to="/vault"
              className={
                'sidebar__navItem' + (current === 'login' ? ' is-active' : '')
              }
              title="패스워드"
            >
              <KeyIcon />
              <span className="sidebar__navText">패스워드</span>
              <span className="sidebar__navCount">{counts.login}</span>
            </Link>
          </li>
          <li>
            <Link
              to="/vault?type=note"
              className={
                'sidebar__navItem' + (current === 'note' ? ' is-active' : '')
              }
              title="보안 메모"
            >
              <NoteIcon />
              <span className="sidebar__navText">메모</span>
              <span className="sidebar__navCount">{counts.note}</span>
            </Link>
          </li>
        </ul>
      </nav>

      <div className="sidebar__bottom">
        <ul className="sidebar__navList">
          <li>
            <Link
              to="/settings"
              className={
                'sidebar__navItem' + (current === 'settings' ? ' is-active' : '')
              }
              title="설정"
            >
              <SettingsIcon />
              <span className="sidebar__navText">설정</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="sidebar__navItem sidebar__navItem--btn"
              onClick={onLogout}
              title="로그아웃"
            >
              <LogoutIcon />
              <span className="sidebar__navText">로그아웃</span>
            </button>
          </li>
        </ul>
        <div className="sidebar__email" title={email}>{email}</div>
      </div>
    </aside>
  );
}

// ---------- inline icons ----------
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
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
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
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
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
