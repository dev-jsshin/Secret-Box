import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Logo from '../components/Logo';
import AlertModal from '../components/AlertModal';
import Avatar from '../components/vault/Avatar';
import AddEditItemModal from '../components/vault/AddEditItemModal';
import ItemHistoryModal from '../components/vault/ItemHistoryModal';

import {
  catalogApi,
  CATEGORY_LABELS,
  type CategorySlug,
  type ServiceCatalogItem,
} from '../api/catalog';
import { vaultApi } from '../api/vault';
import { ApiError, getRefreshToken, setAccessToken, setRefreshToken } from '../api/client';
import { authApi } from '../api/auth';
import { base64ToBytes } from '../crypto/base64';
import { decryptJson } from '../crypto/cipher';
import { useSessionStore } from '../store/session';
import type { DecryptedVaultItem, VaultItemPlaintext } from '../types/vault';

import './Vault.css';

interface ErrorAlert {
  title: string;
  message?: string;
}

interface ConfirmDelete {
  id: string;
  label: string;
}

export default function Vault() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const email = useSessionStore((s) => s.email);
  const clear = useSessionStore((s) => s.clear);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DecryptedVaultItem | null>(null);
  const [historyOf, setHistoryOf] = useState<DecryptedVaultItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);

  // DEK 없으면 (새로고침 등) 로그인으로
  useEffect(() => {
    if (!dek) navigate('/login', { replace: true });
  }, [dek, navigate]);

  // 카탈로그 (아이콘 매핑용)
  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => catalogApi.list(),
    staleTime: 1000 * 60 * 60,
  });

  const catalogMap = useMemo(() => {
    const m = new Map<string, ServiceCatalogItem>();
    catalog?.services.forEach((s) => m.set(s.slug, s));
    return m;
  }, [catalog]);

  // Vault items: 서버에서 받은 즉시 클라이언트에서 복호화
  const { data: items, isPending } = useQuery({
    queryKey: ['vault-items'],
    queryFn: async (): Promise<DecryptedVaultItem[]> => {
      const { items } = await vaultApi.list();
      if (!dek) return [];
      const decrypted = await Promise.all(
        items.map(async (item) => {
          try {
            const plaintext = await decryptJson<VaultItemPlaintext>(
              dek,
              base64ToBytes(item.encryptedData),
              base64ToBytes(item.encryptedIv),
            );
            return { ...item, plaintext } as DecryptedVaultItem;
          } catch {
            return null;
          }
        }),
      );
      return decrypted.filter((x): x is DecryptedVaultItem => x !== null);
    },
    enabled: !!dek,
  });

  // items 리프레시 시 열려있는 모달의 state도 최신 version으로 동기화
  // (복원/수정 후 cached 상태로 다시 저장 시도하면 VERSION_CONFLICT 발생하던 버그 방지)
  useEffect(() => {
    if (!items) return;
    if (editing) {
      const updated = items.find((i) => i.id === editing.id);
      if (updated && updated.version !== editing.version) {
        setEditing(updated);
      } else if (!updated) {
        setEditing(null);   // 항목이 삭제됨
      }
    }
    if (historyOf) {
      const updated = items.find((i) => i.id === historyOf.id);
      if (updated && updated.version !== historyOf.version) {
        setHistoryOf(updated);
      } else if (!updated) {
        setHistoryOf(null);
      }
    }
  }, [items, editing, historyOf]);

  // 헤더 통계: 총 개수 + 카테고리별 카운트 (count desc 정렬)
  const stats = useMemo(() => {
    if (!items) return null;
    const total = items.length;
    if (total === 0) return { total: 0, breakdown: [] as [CategorySlug, number][] };
    const byCategory = new Map<CategorySlug, number>();
    items.forEach((i) => {
      const c = i.plaintext.category;
      byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
    });
    const breakdown = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    return { total, breakdown };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (activeCategory) {
      list = list.filter((i) => i.plaintext.category === activeCategory);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((i) =>
        i.plaintext.name.toLowerCase().includes(q)
        || i.plaintext.username?.toLowerCase().includes(q)
        || CATEGORY_LABELS[i.plaintext.category].includes(q),
      );
    }
    return list;
  }, [items, search, activeCategory]);

  async function handleCopy(item: DecryptedVaultItem) {
    try {
      await navigator.clipboard.writeText(item.plaintext.password);
      setCopiedId(item.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === item.id ? null : cur));
      }, 1500);
    } catch {
      setErrorAlert({
        title: '복사 실패',
        message: '클립보드에 접근할 수 없습니다.',
      });
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vaultApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '삭제에 실패했습니다.';
      setErrorAlert({ title: '삭제 실패', message: msg });
    },
  });

  async function handleLogout() {
    const rt = getRefreshToken();
    if (rt) {
      try { await authApi.logout(rt); } catch { /* 서버 폐기 실패해도 로컬은 정리 */ }
    }
    clear();
    setAccessToken(null);
    setRefreshToken(null);
    navigate('/login', { replace: true });
  }

  if (!dek) return null;

  return (
    <div className="page page--vault">
      <main className="vault">
        <header className="vault__head">
          <div className="vault__topStrip rise delay-1">
            <div className="vault__brand">
              <Logo size={28} />
              <span className="vault__wordmark">SecretBox</span>
            </div>
            <div className="vault__user">
              <span className="vault__email">{email}</span>
              <Link to="/settings" className="vault__userBtn">설정</Link>
              <button type="button" className="vault__userBtn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>

          <section className="vault__hero rise delay-2">
            {stats === null ? (
              <h1 className="vault__heroTitle">
                <em>SecretBox</em>를 여는 중…
              </h1>
            ) : stats.total === 0 ? (
              <h1 className="vault__heroTitle">
                첫 <em>암호</em>를<br />보관해보세요.
              </h1>
            ) : (
              <>
                <h1 className="vault__heroTitle">
                  현재 <em>{stats.total}개</em>의 암호가<br />
                  안전하게 잠겨있어요.
                </h1>
                <ul className="vault__filters" role="tablist" aria-label="카테고리 필터">
                  <li>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeCategory === null}
                      className={
                        'vault__filterChip'
                        + (activeCategory === null ? ' is-active' : '')
                      }
                      onClick={() => setActiveCategory(null)}
                    >
                      <span className="vault__filterLabel">전체</span>
                      <span className="vault__filterCount">{stats.total}</span>
                    </button>
                  </li>
                  {stats.breakdown.map(([cat, count]) => {
                    const isActive = activeCategory === cat;
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={
                            'vault__filterChip' + (isActive ? ' is-active' : '')
                          }
                          onClick={() =>
                            setActiveCategory((prev) => (prev === cat ? null : cat))
                          }
                        >
                          <span className="vault__filterLabel">
                            {CATEGORY_LABELS[cat]}
                          </span>
                          <span className="vault__filterCount">{count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </header>

        <section className="vault__toolbar rise delay-3">
          <input
            type="search"
            className="vault__search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·아이디·카테고리로 검색"
          />
          <button
            type="button"
            className="vault__addBtn"
            onClick={() => setShowAdd(true)}
          >
            + 새 항목
          </button>
        </section>

        <section className="vault__content rise delay-4">
          {isPending && (
            <p className="vault__state">불러오는 중…</p>
          )}

          {!isPending && filtered.length === 0 && items && items.length === 0 && (
            <div className="vault__empty">
              <div className="vault__emptyIcon" aria-hidden>
                <Logo size={44} />
              </div>
              <p className="vault__emptyTitle">아직 보관된 암호가 없어요</p>
              <p className="vault__emptyBody">
                지금 첫 암호를 만들어<br />
                안전하게 잠가보세요.
              </p>
              <button
                type="button"
                className="vault__emptyCta"
                onClick={() => setShowAdd(true)}
              >
                + 첫 항목 등록하기
              </button>
            </div>
          )}

          {!isPending && filtered.length === 0 && items && items.length > 0 && (
            <div className="vault__empty vault__empty--noResults">
              <p className="vault__emptyBody">
                <strong className="vault__searchTerm">{search}</strong>에 해당하는 항목이 없습니다.
              </p>
            </div>
          )}

          <ul className="vault__items">
            {filtered.map((item) => {
              const cat = item.plaintext.catalogSlug
                ? catalogMap.get(item.plaintext.catalogSlug)
                : undefined;
              const displayName = item.plaintext.alias || item.plaintext.name;
              const subName = item.plaintext.alias
                ? (cat?.name || item.plaintext.name)
                : null;
              const isCopied = copiedId === item.id;
              return (
                <li key={item.id} className="vault__card">
                  <button
                    type="button"
                    className="vault__cardBody"
                    onClick={() => setEditing(item)}
                  >
                    <Avatar
                      name={item.plaintext.name}
                      iconUrl={cat?.iconUrl}
                      brandColor={cat?.brandColor}
                      size={36}
                    />
                    <div className="vault__cardInfo">
                      <span className="vault__cardName">{displayName}</span>
                      <span className="vault__cardUser">
                        {subName && (
                          <span className="vault__cardSubname">{subName}</span>
                        )}
                        {subName && item.plaintext.username && ' · '}
                        {item.plaintext.username}
                      </span>
                    </div>
                    <span className="vault__cardCat">
                      {CATEGORY_LABELS[item.plaintext.category]}
                    </span>
                  </button>
                  <div className="vault__cardActions">
                    {item.plaintext.url && (
                      <a
                        className="vault__cardAction"
                        href={item.plaintext.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="바로가기"
                        aria-label="바로가기"
                      >
                        <ExternalLinkIcon />
                      </a>
                    )}
                    <button
                      type="button"
                      className={
                        'vault__cardAction'
                        + (isCopied ? ' vault__cardAction--copied' : '')
                      }
                      onClick={() => handleCopy(item)}
                      title={isCopied ? '복사됨' : '암호 복사'}
                      aria-label="암호 복사"
                    >
                      {isCopied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                    <button
                      type="button"
                      className="vault__cardAction"
                      onClick={() => setHistoryOf(item)}
                      title="변경 이력"
                      aria-label="변경 이력"
                    >
                      <ClockIcon />
                    </button>
                    <button
                      type="button"
                      className="vault__cardAction vault__cardAction--danger"
                      onClick={() =>
                        setConfirmDelete({ id: item.id, label: displayName })
                      }
                      title="삭제"
                      aria-label="삭제"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="vault__foot">
          <p className="vault__system">
            ARGON2ID&nbsp;·&nbsp;HMAC-SHA256&nbsp;·&nbsp;AES-256-GCM&nbsp;·&nbsp;CLIENT-SIDE
          </p>
          <p className="vault__credit">
            Crafted by{' '}
            <span className="vault__creditName">dev-jsshin</span>
            {' '}·{' '}
            <span className="vault__creditName">신준섭</span>
          </p>
        </footer>
      </main>

      <AddEditItemModal
        isOpen={showAdd || editing !== null}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        initialItem={editing}
        onError={(msg) => setErrorAlert({ title: '오류', message: msg })}
      />

      <ItemHistoryModal
        item={historyOf}
        onClose={() => setHistoryOf(null)}
      />

      <AlertModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        variant="warning"
        title="항목을 삭제할까요?"
        message={
          confirmDelete
            ? `"${confirmDelete.label}" 항목을 영구적으로 삭제합니다.`
            : undefined
        }
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        confirmLabel="삭제"
        cancelLabel="취소"
        destructive
      />

      <AlertModal
        isOpen={!!errorAlert}
        onClose={() => setErrorAlert(null)}
        variant="error"
        title={errorAlert?.title ?? ''}
        message={errorAlert?.message}
      />
    </div>
  );
}

// ---------- inline icons ----------
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
