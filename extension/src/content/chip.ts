// SecretBox 자동완성 칩 + 드롭다운 — 모든 UI는 단일 host 엘리먼트의 shadow DOM 안에 둔다.
// 호스트 페이지의 CSS 누수 차단 + 페이지가 우리 노드에 querySelector로 접근하기 어렵게 하는 보너스.
//
// 좌표:
//   - 칩은 password input의 우측 인셋에 고정 (input 안쪽으로 살짝 들어옴 → "사이트가 둔 아이콘"
//     처럼 자연스럽게 보임)
//   - 드롭다운은 칩 아래로 펼침
//   - input의 getBoundingClientRect 기반 — scroll/resize/focus-out 시 갱신

import type { ItemSummary } from '../shared/vaultTypes';

export interface ChipController {
  attachTo: (input: HTMLInputElement) => void;
  detach: () => void;
  setMatches: (items: ItemSummary[]) => void;
  isOpen: () => boolean;
}

export interface ChipCallbacks {
  onPick: (id: string) => Promise<void> | void;
  onOpenSettings: () => void;  // 잠금 상태일 때 노출용
  isLocked: () => boolean;
}

const HOST_ID = 'secretbox-overlay-host';

export function createChip(cb: ChipCallbacks): ChipController {
  let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(host);
  }
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'closed' });

  // 한 번만 스타일/노드 생성
  if (!root.querySelector('.sb-chip')) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    root.appendChild(style);

    const chipEl = document.createElement('button');
    chipEl.className = 'sb-chip';
    chipEl.type = 'button';
    chipEl.title = 'SecretBox';
    chipEl.innerHTML = LOGO_SVG;
    root.appendChild(chipEl);

    const panelEl = document.createElement('div');
    panelEl.className = 'sb-panel';
    root.appendChild(panelEl);
  }

  const chipEl = root.querySelector<HTMLButtonElement>('.sb-chip')!;
  const panelEl = root.querySelector<HTMLDivElement>('.sb-panel')!;

  let anchor: HTMLInputElement | null = null;
  let matches: ItemSummary[] = [];
  let open = false;

  const reposition = () => {
    if (!anchor) {
      chipEl.style.display = 'none';
      panelEl.style.display = 'none';
      return;
    }
    const r = anchor.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) {
      chipEl.style.display = 'none';
      panelEl.style.display = 'none';
      return;
    }
    chipEl.style.display = 'inline-flex';
    const size = Math.min(28, Math.max(20, r.height - 8));
    chipEl.style.width = `${size}px`;
    chipEl.style.height = `${size}px`;
    chipEl.style.left = `${r.right - size - 6}px`;
    chipEl.style.top = `${r.top + (r.height - size) / 2}px`;

    if (open) {
      panelEl.style.display = 'flex';
      panelEl.style.left = `${Math.min(r.right - 280, r.left)}px`;
      panelEl.style.top = `${r.bottom + 6}px`;
      panelEl.style.width = `${Math.max(260, Math.min(320, r.width))}px`;
    } else {
      panelEl.style.display = 'none';
    }
  };

  const renderPanel = () => {
    panelEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'sb-panel__head';
    header.textContent = cb.isLocked() ? 'SecretBox · 잠금' : 'SecretBox';
    panelEl.appendChild(header);

    if (cb.isLocked()) {
      const msg = document.createElement('div');
      msg.className = 'sb-panel__empty';
      msg.textContent = '확장 아이콘에서 먼저 잠금을 해제하세요.';
      panelEl.appendChild(msg);
      return;
    }

    if (matches.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'sb-panel__empty';
      msg.textContent = '이 사이트와 매칭되는 항목이 없어요.';
      panelEl.appendChild(msg);
      return;
    }

    for (const it of matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'sb-row';
      row.innerHTML = `
        <span class="sb-row__icon">${(it.name[0] ?? '?').toUpperCase()}</span>
        <span class="sb-row__body">
          <span class="sb-row__title"></span>
          <span class="sb-row__sub"></span>
        </span>
      `;
      row.querySelector('.sb-row__title')!.textContent = it.name;
      row.querySelector('.sb-row__sub')!.textContent = it.username ?? it.url ?? '';
      row.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        await cb.onPick(it.id);
      });
      panelEl.appendChild(row);
    }
  };

  const openPanel = () => {
    open = true;
    renderPanel();
    reposition();
  };
  const close = () => {
    open = false;
    panelEl.style.display = 'none';
  };

  chipEl.addEventListener('mousedown', (e) => {
    e.preventDefault();   // input의 blur 방지
    e.stopPropagation();
    open ? close() : openPanel();
  });

  // 외부 클릭 시 닫기
  document.addEventListener('mousedown', (e) => {
    if (!open) return;
    const path = e.composedPath();
    if (path.includes(host!)) return;
    close();
  }, true);

  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  return {
    attachTo(input) {
      anchor = input;
      input.addEventListener('focus', reposition);
      input.addEventListener('blur', () => {
        // 칩 클릭으로 인한 blur는 close 안 함 — mousedown preventDefault로 처리됨
        setTimeout(reposition, 50);
      });
      reposition();
    },
    detach() {
      anchor = null;
      reposition();
    },
    setMatches(items) {
      matches = items;
      if (open) renderPanel();
    },
    isOpen: () => open,
  };
}

const LOGO_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 10V8a6 6 0 0112 0v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" stroke-width="2"/>
  <circle cx="12" cy="15.5" r="1.6" fill="currentColor"/>
</svg>`;

// brand 토큰을 popup과 동일하게 가져옴 (값 직접 박음 — content는 별도 빌드라 css 변수 import 안 함)
const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }

.sb-chip {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(212, 146, 74, 0.35);
  background: rgba(11, 14, 26, 0.92);
  color: #D4924A;
  border-radius: 6px;
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
  box-shadow: 0 4px 12px -6px rgba(0, 0, 0, 0.4);
}
.sb-chip:hover {
  background: #11172A;
  color: #E5B069;
  border-color: rgba(212, 146, 74, 0.7);
  transform: translateY(-1px);
}

.sb-panel {
  position: fixed;
  display: none;
  flex-direction: column;
  background: #0A0E1A;
  border: 1px solid rgba(232, 226, 207, 0.12);
  border-radius: 10px;
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #EBE2D0;
  overflow: hidden;
  max-height: 360px;
}

.sb-panel__head {
  padding: 10px 14px;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #D4924A;
  font-weight: 700;
  border-bottom: 1px solid rgba(232, 226, 207, 0.06);
}

.sb-panel__empty {
  padding: 20px 16px;
  font-size: 12px;
  color: #6F6B5F;
  text-align: center;
  line-height: 1.6;
}

.sb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: background 140ms ease;
  width: 100%;
}
.sb-row + .sb-row { border-top: 1px solid rgba(232, 226, 207, 0.04); }
.sb-row:hover, .sb-row:focus-visible { background: #11172A; outline: 0; }

.sb-row__icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: #11172A;
  border: 1px solid rgba(232, 226, 207, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: #D4924A;
  text-transform: uppercase;
}

.sb-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-row__title {
  font-size: 13px;
  font-weight: 600;
  color: #EBE2D0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-row__sub {
  font-size: 11.5px;
  color: #6F6B5F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
