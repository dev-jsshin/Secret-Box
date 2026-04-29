import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';

import {
  ItemTypeKeyIcon,
  ItemTypeNoteIcon,
  ItemTypeCardIcon,
  ItemTypeWifiIcon,
  ItemTypeApiIcon,
} from './ItemTypeIcons';

import './MobileTabBar.css';
import type { SidebarSection, VaultCounts } from './Sidebar';

interface MobileTabBarProps {
  current: SidebarSection;
  counts: VaultCounts;
}

/**
 * 모바일(≤640) 하단 고정 탭바 — 4탭 + "더보기" 바텀 시트.
 * 자주 쓰는 패스워드/메모는 직접 탭, 새 타입(카드/WiFi/API)은 더보기 시트로.
 * iOS notch 안전영역 자동 보정.
 */
export default function MobileTabBar({ current, counts }: MobileTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = current === 'card' || current === 'wifi' || current === 'apikey';

  // 활성 탭이 더보기 영역에 있으면 시트는 자연스럽게 닫혀있어야 함
  useEffect(() => {
    setMoreOpen(false);
  }, [current]);

  // ESC로 시트 닫기
  useEffect(() => {
    if (!moreOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [moreOpen]);

  return (
    <>
      <nav className="mtb" aria-label="모바일 내비게이션">
        <Link
          to="/vault"
          className={'mtb__tab' + (current === 'login' ? ' is-active' : '')}
          aria-label={`패스워드 (${counts.login}개)`}
        >
          <ItemTypeKeyIcon size={20} />
          <span className="mtb__label">패스워드</span>
          {counts.login > 0 && (
            <span className="mtb__badge" aria-hidden>{counts.login}</span>
          )}
        </Link>

        <Link
          to="/vault?type=note"
          className={'mtb__tab' + (current === 'note' ? ' is-active' : '')}
          aria-label={`메모 (${counts.note}개)`}
        >
          <ItemTypeNoteIcon size={20} />
          <span className="mtb__label">메모</span>
          {counts.note > 0 && (
            <span className="mtb__badge" aria-hidden>{counts.note}</span>
          )}
        </Link>

        <button
          type="button"
          className={'mtb__tab mtb__tab--btn' + (moreActive ? ' is-active' : '')}
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="mtb-more-sheet"
        >
          <MoreIcon />
          <span className="mtb__label">더보기</span>
          {(counts.card + counts.wifi + counts.apikey) > 0 && (
            <span className="mtb__badge mtb__badge--dot" aria-hidden />
          )}
        </button>

        <Link
          to="/settings"
          className={'mtb__tab' + (current === 'settings' ? ' is-active' : '')}
        >
          <SettingsIcon />
          <span className="mtb__label">설정</span>
        </Link>
      </nav>

      {moreOpen && createPortal(
        <MoreSheet
          counts={counts}
          current={current}
          onClose={() => setMoreOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

/* ========================================================================
   더보기 바텀 시트 — 카드 / WiFi / API Key 진입로
   ======================================================================== */
function MoreSheet({
  counts,
  current,
  onClose,
}: {
  counts: VaultCounts;
  current: SidebarSection;
  onClose: () => void;
}) {
  return (
    <div className="mtb-sheet" role="dialog" aria-modal="true" aria-label="추가 보관함">
      <div className="mtb-sheet__backdrop" onClick={onClose} />
      <div id="mtb-more-sheet" className="mtb-sheet__card" role="document">
        <div className="mtb-sheet__handle" aria-hidden />
        <div className="mtb-sheet__head">
          <span className="mtb-sheet__eyebrow">VAULT — MORE</span>
          <h3 className="mtb-sheet__title">다른 항목 보관함</h3>
        </div>

        <ul className="mtb-sheet__list">
          <SheetItem
            href="/vault?type=card"
            label="카드"
            sub="신용·체크카드 정보 보관"
            count={counts.card}
            isActive={current === 'card'}
            Icon={ItemTypeCardIcon}
          />
          <SheetItem
            href="/vault?type=wifi"
            label="와이파이"
            sub="네트워크 비밀번호 + QR 공유"
            count={counts.wifi}
            isActive={current === 'wifi'}
            Icon={ItemTypeWifiIcon}
          />
          <SheetItem
            href="/vault?type=apikey"
            label="API Key"
            sub="개발자 시크릿 · 환경별 분류"
            count={counts.apikey}
            isActive={current === 'apikey'}
            Icon={ItemTypeApiIcon}
          />
        </ul>

        <button
          type="button"
          className="mtb-sheet__close"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function SheetItem({
  href,
  label,
  sub,
  count,
  isActive,
  Icon,
}: {
  href: string;
  label: string;
  sub: string;
  count: number;
  isActive: boolean;
  Icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <li>
      <Link
        to={href}
        className={'mtb-sheet__item' + (isActive ? ' is-active' : '')}
      >
        <div className="mtb-sheet__itemIcon">
          <Icon size={20} />
        </div>
        <div className="mtb-sheet__itemText">
          <span className="mtb-sheet__itemLabel">{label}</span>
          <span className="mtb-sheet__itemSub">{sub}</span>
        </div>
        <span className="mtb-sheet__itemCount">{count}</span>
      </Link>
    </li>
  );
}

// ---------- inline icons ----------
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
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
