import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Logo from '../components/Logo';
import AlertModal from '../components/AlertModal';
import Sidebar from '../components/Sidebar';
import MobileTabBar from '../components/MobileTabBar';
import Avatar from '../components/vault/Avatar';
import AddEditItemModal from '../components/vault/AddEditItemModal';
import ItemHistoryModal from '../components/vault/ItemHistoryModal';
import TotpDisplay from '../components/vault/TotpDisplay';

import {
  catalogApi,
  CATEGORY_LABELS,
  type CategorySlug,
  type ServiceCatalogItem,
} from '../api/catalog';
import { vaultApi } from '../api/vault';
import { ApiError, getRefreshToken, setAccessToken, setRefreshToken } from '../api/client';
import { authApi } from '../api/auth';
import { base64ToBytes, bytesToBase64 } from '../crypto/base64';
import { decryptJson, encryptJson } from '../crypto/cipher';
import { useSessionStore } from '../store/session';
import type { DecryptedVaultItem, VaultItemPlaintext } from '../types/vault';

type SortMode = 'favoriteUpdated' | 'name' | 'updated' | 'created';

const SORT_LABELS: Record<SortMode, string> = {
  favoriteUpdated: '즐겨찾기 우선',
  name: '이름순',
  updated: '최근 수정순',
  created: '최근 추가순',
};

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
  const unlockMaterial = useSessionStore((s) => s.unlockMaterial);
  const clear = useSessionStore((s) => s.clear);

  const [searchParams] = useSearchParams();
  // URL ?type=note 면 메모 탭, 그 외엔 로그인 탭 (기본)
  const itemType: 'login' | 'note' = searchParams.get('type') === 'note' ? 'note' : 'login';

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('favoriteUpdated');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DecryptedVaultItem | null>(null);
  const [historyOf, setHistoryOf] = useState<DecryptedVaultItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [copiedTotpId, setCopiedTotpId] = useState<string | null>(null);
  const [totpVisible, setTotpVisible] = useState(true);
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);

  // DEK 없으면 (새로고침 등) 로그인으로 — 단, unlockMaterial이 있으면 잠금 상태이므로 LockScreen이 처리
  useEffect(() => {
    if (!dek && !unlockMaterial) navigate('/login', { replace: true });
  }, [dek, unlockMaterial, navigate]);

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

  // 사이드바/탭바에 보여줄 타입별 카운트 (전체 items 기준 — 필터와 무관)
  const typeCounts = useMemo(() => {
    if (!items) return { login: 0, note: 0 };
    let login = 0;
    let note = 0;
    items.forEach((i) => {
      if (i.itemType === 'note') note++;
      else login++;
    });
    return { login, note };
  }, [items]);

  // 현재 활성 타입에 속한 항목들만 추려서 카테고리 brakedown 계산
  const itemsOfType = useMemo(
    () => items?.filter((i) => (i.itemType === 'note' ? 'note' : 'login') === itemType) ?? [],
    [items, itemType],
  );

  // 헤더 통계: 활성 타입의 총 개수 + 카테고리별 카운트 (count desc 정렬)
  const stats = useMemo(() => {
    const total = itemsOfType.length;
    if (total === 0) return { total: 0, breakdown: [] as [CategorySlug, number][] };
    const byCategory = new Map<CategorySlug, number>();
    itemsOfType.forEach((i) => {
      const c = i.plaintext.category;
      byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
    });
    const breakdown = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    return { total, breakdown };
  }, [itemsOfType]);

  const hasAnyTotp = useMemo(
    () => itemsOfType.some((i) => !!i.plaintext.totpSecret),
    [itemsOfType],
  );

  // 탭 전환 시 검색어/카테고리 필터 초기화 (사용자가 깨끗한 화면을 기대)
  useEffect(() => {
    setSearch('');
    setActiveCategory(null);
  }, [itemType]);

  const filtered = useMemo(() => {
    let list = itemsOfType;
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
    // 정렬 — 원본 배열을 직접 변형하지 않도록 복사
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortMode) {
        case 'name':
          return (a.plaintext.alias || a.plaintext.name)
            .localeCompare(b.plaintext.alias || b.plaintext.name, 'ko');
        case 'updated':
          return b.updatedAt.localeCompare(a.updatedAt);
        case 'created':
          return b.createdAt.localeCompare(a.createdAt);
        case 'favoriteUpdated':
        default: {
          const fa = a.plaintext.favorite ? 1 : 0;
          const fb = b.plaintext.favorite ? 1 : 0;
          if (fa !== fb) return fb - fa;       // 즐겨찾기 먼저
          return b.updatedAt.localeCompare(a.updatedAt);
        }
      }
    });
    return sorted;
  }, [itemsOfType, search, activeCategory, sortMode]);

  async function handleCopy(item: DecryptedVaultItem) {
    if (!item.plaintext.password) return;
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

  async function handleCopyUsername(item: DecryptedVaultItem) {
    if (!item.plaintext.username) return;
    try {
      await navigator.clipboard.writeText(item.plaintext.username);
      setCopiedUserId(item.id);
      setTimeout(() => {
        setCopiedUserId((cur) => (cur === item.id ? null : cur));
      }, 1500);
    } catch {
      setErrorAlert({
        title: '복사 실패',
        message: '클립보드에 접근할 수 없습니다.',
      });
    }
  }

  async function handleCopyTotp(itemId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedTotpId(itemId);
      setTimeout(() => {
        setCopiedTotpId((cur) => (cur === itemId ? null : cur));
      }, 1500);
    } catch {
      setErrorAlert({
        title: '복사 실패',
        message: '클립보드에 접근할 수 없습니다.',
      });
    }
  }

  /**
   * 즐겨찾기 토글 — 항목 plaintext에 favorite 필드만 바꿔 재암호화 후 update.
   * 모달 안 거치는 가벼운 in-place 액션. 버전 충돌 시 무시 (다음 동기화에서 갱신).
   */
  const favoriteMutation = useMutation({
    mutationFn: async (item: DecryptedVaultItem) => {
      if (!dek) throw new Error('NO_DEK');
      const newPlaintext: VaultItemPlaintext = {
        ...item.plaintext,
        favorite: !item.plaintext.favorite,
      };
      const { ciphertext, iv } = await encryptJson(dek, newPlaintext);
      return vaultApi.update(item.id, {
        encryptedData: bytesToBase64(ciphertext),
        encryptedIv: bytesToBase64(iv),
        expectedVersion: item.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '즐겨찾기 변경 실패';
      setErrorAlert({ title: '오류', message: msg });
    },
  });

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

  if (!dek && !unlockMaterial) return null;

  const typeLabel = itemType === 'note' ? '메모' : '패스워드';
  // 패스워드/메모 둘 다 받침 없는 모음 → '가' 통일

  return (
    <div className="page page--vault">
      <Sidebar
        current={itemType}
        counts={typeCounts}
        email={email ?? ''}
        onLogout={handleLogout}
      />
      <main className="vault">
        <header className="vault__head">
          {/* 모바일 전용 상단 brand — 사이드바 숨겨진 환경에서 로고 노출 */}
          <div className="vault__mobileBrand">
            <Logo size={22} />
            <span className="vault__mobileWordmark">SecretBox</span>
          </div>
          <section className="vault__hero rise delay-2">
            {stats.total === 0 && itemType === 'note' ? (
              <h1 className="vault__heroTitle">
                첫 <em>보안 메모</em>를<br />작성해보세요.
              </h1>
            ) : stats.total === 0 ? (
              <h1 className="vault__heroTitle">
                첫 <em>비밀</em>을<br />보관해보세요.
              </h1>
            ) : (
              <>
                <h1 className="vault__heroTitle">
                  현재 <em>{stats.total}개</em>의 {typeLabel}가<br />
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
            placeholder="이름·아이디·카테고리·메모 제목 검색"
          />
          <select
            className="vault__sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            title="정렬"
            aria-label="정렬 순서"
          >
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          {hasAnyTotp && (
            <button
              type="button"
              className={
                'vault__totpToggle'
                + (totpVisible ? '' : ' vault__totpToggle--hidden')
              }
              onClick={() => setTotpVisible((v) => !v)}
              title={totpVisible ? 'TOTP 코드 가리기' : 'TOTP 코드 보이기'}
              aria-pressed={!totpVisible}
            >
              {totpVisible ? <EyeIcon /> : <EyeOffIcon />}
              <span>TOTP</span>
            </button>
          )}
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

          {!isPending && itemsOfType.length === 0 && (
            <div className="vault__empty">
              <div className="vault__emptyIcon" aria-hidden>
                <Logo size={44} />
              </div>
              <p className="vault__emptyTitle">
                {itemType === 'note'
                  ? '아직 작성된 메모가 없어요'
                  : '아직 보관된 패스워드가 없어요'}
              </p>
              <p className="vault__emptyBody">
                {itemType === 'note'
                  ? '와이파이 비밀번호, 보안 질문 답…\n자유 텍스트로 안전하게 저장하세요.'
                  : '카탈로그에서 서비스를 고르거나\n직접 입력해 등록할 수 있어요.'}
              </p>
              <button
                type="button"
                className="vault__emptyCta"
                onClick={() => setShowAdd(true)}
              >
                {itemType === 'note' ? '+ 첫 메모 작성하기' : '+ 첫 패스워드 등록하기'}
              </button>
            </div>
          )}

          {!isPending && itemsOfType.length > 0 && filtered.length === 0 && (
            <div className="vault__empty vault__empty--noResults">
              <p className="vault__emptyBody">
                <strong className="vault__searchTerm">{search}</strong>에 해당하는 {typeLabel} 항목이 없습니다.
              </p>
            </div>
          )}

          <ul className="vault__items">
            {filtered.map((item) => {
              const cat = item.plaintext.catalogSlug
                ? catalogMap.get(item.plaintext.catalogSlug)
                : undefined;
              const isCopied = copiedId === item.id;
              const isNote = item.itemType === 'note';
              return (
                <li
                  key={item.id}
                  className={'vault__card' + (isNote ? ' vault__card--note' : '')}
                >
                  <button
                    type="button"
                    className="vault__cardBody"
                    onClick={() => setEditing(item)}
                  >
                    {isNote ? (
                      <div className="vault__noteAvatar" aria-hidden>
                        <NoteIcon />
                      </div>
                    ) : (
                      <Avatar
                        name={item.plaintext.name}
                        iconUrl={cat?.iconUrl}
                        brandColor={cat?.brandColor}
                        size={36}
                      />
                    )}
                    <div className="vault__cardInfo">
                      <span className="vault__cardName">{item.plaintext.name}</span>
                      {isNote ? (
                        <span className="vault__cardUser vault__cardUser--note">
                          •••••• 보안 메모 — 클릭해 열기
                        </span>
                      ) : (
                        <span className="vault__cardUser">
                          {item.plaintext.alias && (
                            <span className="vault__cardSubname">{item.plaintext.alias}</span>
                          )}
                          {item.plaintext.alias && item.plaintext.username && ' · '}
                          {item.plaintext.username}
                        </span>
                      )}
                    </div>
                    <span className="vault__cardCat">
                      {isNote ? '메모' : CATEGORY_LABELS[item.plaintext.category]}
                    </span>
                  </button>
                  {!isNote && item.plaintext.totpSecret && (
                    <TotpDisplay
                      secret={item.plaintext.totpSecret}
                      visible={totpVisible}
                      isCopied={copiedTotpId === item.id}
                      onCopy={(code) => handleCopyTotp(item.id, code)}
                    />
                  )}
                  <div className="vault__cardActions">
                    <button
                      type="button"
                      className={
                        'vault__cardAction vault__cardAction--star'
                        + (item.plaintext.favorite ? ' is-on' : '')
                      }
                      onClick={() => favoriteMutation.mutate(item)}
                      disabled={favoriteMutation.isPending}
                      title={item.plaintext.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                      aria-label={item.plaintext.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                      aria-pressed={!!item.plaintext.favorite}
                    >
                      <StarIcon filled={!!item.plaintext.favorite} />
                    </button>
                    {!isNote && item.plaintext.url && (
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
                    {!isNote && item.plaintext.username && (
                      <button
                        type="button"
                        className={
                          'vault__cardAction'
                          + (copiedUserId === item.id ? ' vault__cardAction--copiedUser' : '')
                        }
                        onClick={() => handleCopyUsername(item)}
                        title={copiedUserId === item.id ? '복사됨' : '아이디 복사'}
                        aria-label="아이디 복사"
                      >
                        {copiedUserId === item.id ? <CheckIcon /> : <UserIcon />}
                      </button>
                    )}
                    {!isNote && (
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
                        {isCopied ? <CheckIcon /> : <KeyIcon />}
                      </button>
                    )}
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
                        setConfirmDelete({ id: item.id, label: item.plaintext.name })
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
            {/* <span className="vault__creditName">dev-jsshin</span>
            {' '}·{' '} */}
            <span className="vault__creditName">신준섭</span>
          </p>
        </footer>
      </main>

      <AddEditItemModal
        isOpen={showAdd || editing !== null}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        initialItem={editing}
        initialType={itemType}
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

      <MobileTabBar current={itemType} />
    </div>
  );
}

// ---------- inline icons ----------
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16"
         fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.85 19.85 0 0 1-3.17 4.19" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-1.5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5V21" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <line x1="10.83" y1="12.17" x2="20" y2="3" />
      <line x1="17" y1="6" x2="20" y2="9" />
      <line x1="14" y1="9" x2="17" y2="12" />
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

