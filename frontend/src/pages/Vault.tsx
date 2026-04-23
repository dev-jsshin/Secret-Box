import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Logo from '../components/Logo';
import AlertModal from '../components/AlertModal';
import Avatar from '../components/vault/Avatar';
import AddEditItemModal from '../components/vault/AddEditItemModal';
import ItemDetailModal from '../components/vault/ItemDetailModal';

import {
  catalogApi,
  CATEGORY_LABELS,
  type CategorySlug,
  type ServiceCatalogItem,
} from '../api/catalog';
import { vaultApi } from '../api/vault';
import { ApiError, setAccessToken } from '../api/client';
import { base64ToBytes } from '../crypto/base64';
import { decryptJson } from '../crypto/cipher';
import { useSessionStore } from '../store/session';
import type { DecryptedVaultItem, VaultItemPlaintext } from '../types/vault';

import './Vault.css';

interface ErrorAlert {
  title: string;
  message?: string;
}

export default function Vault() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const email = useSessionStore((s) => s.email);
  const clear = useSessionStore((s) => s.clear);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DecryptedVaultItem | null>(null);
  const [selected, setSelected] = useState<DecryptedVaultItem | null>(null);
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
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) =>
      i.plaintext.name.toLowerCase().includes(q)
      || i.plaintext.username?.toLowerCase().includes(q)
      || CATEGORY_LABELS[i.plaintext.category].includes(q),
    );
  }, [items, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vaultApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      setSelected(null);
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '삭제에 실패했습니다.';
      setErrorAlert({ title: '삭제 실패', message: msg });
    },
  });

  function handleLogout() {
    clear();
    setAccessToken(null);
    navigate('/login', { replace: true });
  }

  if (!dek) return null;

  return (
    <div className="page">
      <main className="vault">
        <header className="vault__head">
          <div className="vault__topStrip rise delay-1">
            <div className="vault__brand">
              <Logo size={26} />
              <span className="vault__wordmark">SecretBox</span>
            </div>
            <div className="vault__user">
              <span className="vault__email">{email}</span>
              <button type="button" className="vault__logout" onClick={handleLogout}>
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
                <ul className="vault__breakdown">
                  {stats.breakdown.map(([cat, count]) => (
                    <li key={cat} className="vault__breakdownItem">
                      <span className="vault__breakdownLabel">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="vault__breakdownCount">{count}</span>
                    </li>
                  ))}
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
                <span className="mono">{search}</span>에 해당하는 항목이 없습니다.
              </p>
            </div>
          )}

          <ul className="vault__items">
            {filtered.map((item) => {
              const cat = item.plaintext.catalogSlug
                ? catalogMap.get(item.plaintext.catalogSlug)
                : undefined;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="vault__card"
                    onClick={() => setSelected(item)}
                  >
                    <Avatar
                      name={item.plaintext.name}
                      iconUrl={cat?.iconUrl}
                      brandColor={cat?.brandColor}
                      size={36}
                    />
                    <div className="vault__cardInfo">
                      <span className="vault__cardName">{item.plaintext.name}</span>
                      {item.plaintext.username && (
                        <span className="vault__cardUser">{item.plaintext.username}</span>
                      )}
                    </div>
                    <span className="vault__cardCat">
                      {CATEGORY_LABELS[item.plaintext.category]}
                    </span>
                  </button>
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

      <ItemDetailModal
        item={selected}
        catalogMap={catalogMap}
        onClose={() => setSelected(null)}
        onEdit={() => {
          setEditing(selected);
          setSelected(null);
        }}
        onDelete={() => {
          if (selected) deleteMutation.mutate(selected.id);
        }}
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
