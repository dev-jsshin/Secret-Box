import { useMemo, useState } from 'react';

export interface PopupItemRow {
  id: string;
  name: string;
  username?: string;
  url?: string;
  catalogSlug?: string;
  matchedHost: boolean; // 현재 탭 host와 매칭됨
}

interface Props {
  items: PopupItemRow[];
  currentHost: string;
  onPickItem: (id: string) => void;
  onLock: () => void;
  onOpenSettings: () => void;
}

export function ItemsScreen({ items, currentHost, onPickItem, onLock, onOpenSettings }: Props) {
  const [query, setQuery] = useState('');

  const { matched, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (i: PopupItemRow) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.username?.toLowerCase().includes(q) ||
      i.url?.toLowerCase().includes(q);
    return {
      matched: items.filter((i) => i.matchedHost && filter(i)),
      others: items.filter((i) => !i.matchedHost && filter(i)),
    };
  }, [items, query]);

  const empty = matched.length === 0 && others.length === 0;

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar__brand">
          <span className="topbar__dot" aria-hidden />
          SecretBox · {currentHost || 'no tab'}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="iconBtn" type="button" title="설정" onClick={onOpenSettings}>
            ⚙
          </button>
          <button className="iconBtn" type="button" title="즉시 잠금" onClick={onLock}>
            ⌫
          </button>
        </div>
      </div>

      <div className="items__search">
        <span className="items__searchIcon">⌕</span>
        <input
          className="items__searchInput"
          type="search"
          placeholder="이름, 아이디, URL 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="items__list">
        {empty && (
          <div className="items__empty">
            <p className="items__emptyTitle">표시할 항목이 없어요</p>
            <p className="items__emptyDesc">
              검색어를 바꾸거나, vault에 새 항목을 추가해 보세요.
            </p>
          </div>
        )}

        {matched.length > 0 && (
          <>
            <div className="items__group">
              <span className="items__groupLabel">이 사이트</span>
              <span className="items__groupRule" />
            </div>
            {matched.map((it) => (
              <ItemRow key={it.id} item={it} onPick={onPickItem} />
            ))}
          </>
        )}

        {others.length > 0 && (
          <>
            <div className="items__group">
              <span className="items__groupLabel">전체 항목</span>
              <span className="items__groupRule" />
            </div>
            {others.map((it) => (
              <ItemRow key={it.id} item={it} onPick={onPickItem} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onPick }: { item: PopupItemRow; onPick: (id: string) => void }) {
  const initial = (item.catalogSlug ?? item.name).charAt(0).toUpperCase();
  return (
    <button className="itemCard" type="button" onClick={() => onPick(item.id)}>
      <span className="itemCard__icon">{initial}</span>
      <span className="itemCard__body">
        <span className="itemCard__title">{item.name}</span>
        <span className="itemCard__sub">{item.username ?? item.url ?? '—'}</span>
      </span>
      {item.matchedHost && <span className="itemCard__matched">match</span>}
    </button>
  );
}
