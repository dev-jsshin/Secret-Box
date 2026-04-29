import { Link } from 'react-router-dom';

import Logo from './Logo';
import { ItemTypeKeyIcon, ItemTypeNoteIcon, ItemTypeCardIcon, ItemTypeWifiIcon, ItemTypeApiIcon } from './ItemTypeIcons';

import './Sidebar.css';

export type VaultType = 'login' | 'note' | 'card' | 'wifi' | 'apikey';
export type SidebarSection = VaultType | 'settings';

export interface VaultCounts {
  login: number;
  note: number;
  card: number;
  wifi: number;
  apikey: number;
}

interface SidebarProps {
  current: SidebarSection;
  counts: VaultCounts;
  email: string;
  onLogout: () => void;
}

interface NavMeta {
  type: VaultType;
  label: string;
  href: string;
  Icon: React.ComponentType<{ size?: number }>;
}

export const VAULT_NAV: NavMeta[] = [
  { type: 'login',  label: '패스워드', href: '/vault',              Icon: ItemTypeKeyIcon  },
  { type: 'note',   label: '메모',    href: '/vault?type=note',    Icon: ItemTypeNoteIcon },
  { type: 'card',   label: '카드',    href: '/vault?type=card',    Icon: ItemTypeCardIcon },
  { type: 'wifi',   label: '와이파이', href: '/vault?type=wifi',    Icon: ItemTypeWifiIcon },
  { type: 'apikey', label: 'API Key', href: '/vault?type=apikey',  Icon: ItemTypeApiIcon  },
];

/**
 * 데스크톱(≥920) 240px 풀, 태블릿(768~919) 64px 아이콘 전용.
 * 모바일(≤640)에선 display:none — MobileTabBar가 대신 등장.
 */
export default function Sidebar({ current, counts, email, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="메인 내비게이션">
      <div className="sidebar__brand">
        <Logo size={24} />
        <span className="sidebar__wordmark">SecretBox</span>
      </div>

      <nav className="sidebar__nav">
        <span className="sidebar__sectionLabel">
          <span className="sidebar__sectionNum">5</span>
          <span>보관함</span>
        </span>
        <ul className="sidebar__navList">
          {VAULT_NAV.map(({ type, label, href, Icon }) => {
            const count = counts[type];
            const isActive = current === type;
            return (
              <li key={type}>
                <Link
                  to={href}
                  className={'sidebar__navItem' + (isActive ? ' is-active' : '')}
                  title={label}
                >
                  <Icon size={18} />
                  <span className="sidebar__navText">{label}</span>
                  <span className="sidebar__navCount">{count}</span>
                </Link>
              </li>
            );
          })}
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
