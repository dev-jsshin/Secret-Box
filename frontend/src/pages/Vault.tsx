import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Logo from '../components/Logo';
import AlertModal from '../components/AlertModal';
import Sidebar, { type VaultType, type VaultCounts } from '../components/Sidebar';
import MobileTabBar from '../components/MobileTabBar';
import {
  ItemTypeKeyIcon,
  ItemTypeNoteIcon,
  ItemTypeCardIcon,
  ItemTypeWifiIcon,
  ItemTypeApiIcon,
} from '../components/ItemTypeIcons';
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

const VALID_TYPES: VaultType[] = ['login', 'note', 'card', 'wifi', 'apikey'];

function parseType(raw: string | null): VaultType {
  if (raw && (VALID_TYPES as string[]).includes(raw)) return raw as VaultType;
  return 'login';
}

const TYPE_LABELS: Record<VaultType, string> = {
  login: '패스워드',
  note: '메모',
  card: '카드',
  wifi: '와이파이',
  apikey: 'API Key',
};

// 한국어 조사: 받침 따라 이/가
function particle(t: VaultType): string {
  switch (t) {
    case 'login':  return '가';   // 패스워드
    case 'note':   return '가';   // 메모
    case 'card':   return '가';   // 카드
    case 'wifi':   return '가';   // 와이파이
    case 'apikey': return '가';   // API Key (영어 끝, "이"가 더 어색)
  }
}

export default function Vault() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const email = useSessionStore((s) => s.email);
  const unlockMaterial = useSessionStore((s) => s.unlockMaterial);
  const clear = useSessionStore((s) => s.clear);

  const [searchParams] = useSearchParams();
  const itemType: VaultType = parseType(searchParams.get('type'));

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

  useEffect(() => {
    if (!dek && !unlockMaterial) navigate('/login', { replace: true });
  }, [dek, unlockMaterial, navigate]);

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

  useEffect(() => {
    if (!items) return;
    if (editing) {
      const updated = items.find((i) => i.id === editing.id);
      if (updated && updated.version !== editing.version) {
        setEditing(updated);
      } else if (!updated) {
        setEditing(null);
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

  // 5 타입 카운트
  const typeCounts: VaultCounts = useMemo(() => {
    const c: VaultCounts = { login: 0, note: 0, card: 0, wifi: 0, apikey: 0 };
    if (!items) return c;
    items.forEach((i) => {
      const t = i.itemType as VaultType;
      if (VALID_TYPES.includes(t)) c[t]++;
      else c.login++;        // 알 수 없는 타입은 login으로 분류 (legacy)
    });
    return c;
  }, [items]);

  // 현재 활성 타입에 속한 항목들만
  const itemsOfType = useMemo(
    () => items?.filter((i) => {
      const t = (i.itemType as VaultType);
      const normalized = VALID_TYPES.includes(t) ? t : 'login';
      return normalized === itemType;
    }) ?? [],
    [items, itemType],
  );

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
        || i.plaintext.alias?.toLowerCase().includes(q)
        || i.plaintext.ssid?.toLowerCase().includes(q)
        || CATEGORY_LABELS[i.plaintext.category].includes(q),
      );
    }
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
          if (fa !== fb) return fb - fa;
          return b.updatedAt.localeCompare(a.updatedAt);
        }
      }
    });
    return sorted;
  }, [itemsOfType, search, activeCategory, sortMode]);

  // 타입별 복사 핸들러 매핑 — login(password), card(cardNumber), wifi(password), apikey(apiKeySecret)
  function getPrimarySecret(item: DecryptedVaultItem): string | undefined {
    const p = item.plaintext;
    switch (item.itemType as VaultType) {
      case 'card':   return p.cardNumber;
      case 'apikey': return p.apiKeySecret;
      default:       return p.password;
    }
  }

  function getPrimaryLabel(itemType: VaultType): string {
    switch (itemType) {
      case 'card':   return '카드번호 복사';
      case 'apikey': return 'Secret 복사';
      default:       return '암호 복사';
    }
  }

  async function handleCopy(item: DecryptedVaultItem) {
    const secret = getPrimarySecret(item);
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
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
      queryClient.invalidateQueries({ queryKey: ['vault-counts'] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '삭제에 실패했습니다.';
      setErrorAlert({ title: '삭제 실패', message: msg });
    },
  });

  async function handleLogout() {
    const rt = getRefreshToken();
    if (rt) {
      try { await authApi.logout(rt); } catch { /* noop */ }
    }
    clear();
    setAccessToken(null);
    setRefreshToken(null);
    navigate('/login', { replace: true });
  }

  if (!dek && !unlockMaterial) return null;

  const typeLabel = TYPE_LABELS[itemType];
  const typePart = particle(itemType);

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
          <div className="vault__mobileBrand">
            <Logo size={22} />
            <span className="vault__mobileWordmark">SecretBox</span>
          </div>
          <section className="vault__hero rise delay-2">
            {stats.total === 0 ? (
              <EmptyHero itemType={itemType} />
            ) : (
              <>
                <h1 className="vault__heroTitle">
                  현재 <em>{stats.total}개</em>의 {typeLabel}{typePart}<br />{' '}
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
            placeholder={searchPlaceholder(itemType)}
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
          {itemType === 'login' && hasAnyTotp && (
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
            <EmptyState itemType={itemType} onAdd={() => setShowAdd(true)} />
          )}

          {!isPending && itemsOfType.length > 0 && filtered.length === 0 && (
            <div className="vault__empty vault__empty--noResults">
              <p className="vault__emptyBody">
                <strong className="vault__searchTerm">{search}</strong>에 해당하는 {typeLabel} 항목이 없습니다.
              </p>
            </div>
          )}

          <ul className="vault__items">
            {filtered.map((item) => (
              <VaultCard
                key={item.id}
                item={item}
                catalog={item.plaintext.catalogSlug ? catalogMap.get(item.plaintext.catalogSlug) : undefined}
                copiedSecret={copiedId === item.id}
                copiedUser={copiedUserId === item.id}
                copiedTotp={copiedTotpId === item.id}
                totpVisible={totpVisible}
                favoritePending={favoriteMutation.isPending}
                onOpen={() => setEditing(item)}
                onFavorite={() => favoriteMutation.mutate(item)}
                onCopy={() => handleCopy(item)}
                onCopyUser={() => handleCopyUsername(item)}
                onCopyTotp={(code) => handleCopyTotp(item.id, code)}
                onHistory={() => setHistoryOf(item)}
                onDelete={() => setConfirmDelete({ id: item.id, label: item.plaintext.name })}
                getPrimaryLabel={getPrimaryLabel}
              />
            ))}
          </ul>
        </section>

        <footer className="vault__foot">
          <p className="vault__system">
            ARGON2ID&nbsp;·&nbsp;HMAC-SHA256&nbsp;·&nbsp;AES-256-GCM&nbsp;·&nbsp;CLIENT-SIDE
          </p>
          <p className="vault__credit">
            Crafted by{' '}
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

      <MobileTabBar current={itemType} counts={typeCounts} />
    </div>
  );
}

/* ========================================================================
   VaultCard — 항목 한 줄. 타입별 표시 분기.
   ======================================================================== */
interface VaultCardProps {
  item: DecryptedVaultItem;
  catalog?: ServiceCatalogItem;
  copiedSecret: boolean;
  copiedUser: boolean;
  copiedTotp: boolean;
  totpVisible: boolean;
  favoritePending: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onCopy: () => void;
  onCopyUser: () => void;
  onCopyTotp: (code: string) => void;
  onHistory: () => void;
  onDelete: () => void;
  getPrimaryLabel: (t: VaultType) => string;
}

function VaultCard(p: VaultCardProps) {
  const itemType = p.item.itemType as VaultType;
  const plaintext = p.item.plaintext;

  return (
    <li className={`vault__card vault__card--${itemType}`}>
      <button
        type="button"
        className="vault__cardBody"
        onClick={p.onOpen}
      >
        <CardAvatar item={p.item} catalog={p.catalog} />
        <div className="vault__cardInfo">
          <span className="vault__cardName">{plaintext.name}</span>
          <CardSubLine item={p.item} />
        </div>
        <span className="vault__cardCat">
          {cardTypeLabel(p.item)}
        </span>
      </button>

      {itemType === 'login' && plaintext.totpSecret && (
        <TotpDisplay
          secret={plaintext.totpSecret}
          visible={p.totpVisible}
          isCopied={p.copiedTotp}
          onCopy={p.onCopyTotp}
        />
      )}

      <div className="vault__cardActions">
        <button
          type="button"
          className={
            'vault__cardAction vault__cardAction--star'
            + (plaintext.favorite ? ' is-on' : '')
          }
          onClick={p.onFavorite}
          disabled={p.favoritePending}
          title={plaintext.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-label={plaintext.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-pressed={!!plaintext.favorite}
        >
          <StarIcon filled={!!plaintext.favorite} />
        </button>

        {itemType === 'login' && plaintext.url && (
          <a
            className="vault__cardAction"
            href={plaintext.url}
            target="_blank"
            rel="noopener noreferrer"
            title="바로가기"
            aria-label="바로가기"
          >
            <ExternalLinkIcon />
          </a>
        )}

        {itemType === 'login' && plaintext.username && (
          <button
            type="button"
            className={
              'vault__cardAction'
              + (p.copiedUser ? ' vault__cardAction--copiedUser' : '')
            }
            onClick={p.onCopyUser}
            title={p.copiedUser ? '복사됨' : '아이디 복사'}
            aria-label="아이디 복사"
          >
            {p.copiedUser ? <CheckIcon /> : <UserIcon />}
          </button>
        )}

        {(itemType === 'login' || itemType === 'card' || itemType === 'apikey'
          || (itemType === 'wifi' && plaintext.password)) && (
          <button
            type="button"
            className={
              'vault__cardAction'
              + (p.copiedSecret ? ' vault__cardAction--copied' : '')
            }
            onClick={p.onCopy}
            title={p.copiedSecret ? '복사됨' : p.getPrimaryLabel(itemType)}
            aria-label={p.getPrimaryLabel(itemType)}
          >
            {p.copiedSecret ? <CheckIcon /> : <KeyIcon />}
          </button>
        )}

        <button
          type="button"
          className="vault__cardAction"
          onClick={p.onHistory}
          title="변경 이력"
          aria-label="변경 이력"
        >
          <ClockIcon />
        </button>
        <button
          type="button"
          className="vault__cardAction vault__cardAction--danger"
          onClick={p.onDelete}
          title="삭제"
          aria-label="삭제"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

function CardAvatar({ item, catalog }: { item: DecryptedVaultItem; catalog?: ServiceCatalogItem }) {
  const itemType = item.itemType as VaultType;
  if (itemType === 'note') {
    return <div className="vault__typeAvatar vault__typeAvatar--note" aria-hidden><ItemTypeNoteIcon size={18} /></div>;
  }
  if (itemType === 'card') {
    return <div className="vault__typeAvatar vault__typeAvatar--card" aria-hidden><ItemTypeCardIcon size={18} /></div>;
  }
  if (itemType === 'wifi') {
    return <div className="vault__typeAvatar vault__typeAvatar--wifi" aria-hidden><ItemTypeWifiIcon size={18} /></div>;
  }
  if (itemType === 'apikey') {
    const env = item.plaintext.apiEnvironment;
    const tone = env === 'production' ? 'danger' : env === 'staging' ? 'warning' : 'neutral';
    return (
      <div className={`vault__typeAvatar vault__typeAvatar--apikey vault__typeAvatar--${tone}`} aria-hidden>
        <ItemTypeApiIcon size={18} />
      </div>
    );
  }
  // login (기본)
  return (
    <Avatar
      name={item.plaintext.name}
      iconUrl={catalog?.iconUrl}
      brandColor={catalog?.brandColor}
      size={36}
    />
  );
}

function CardSubLine({ item }: { item: DecryptedVaultItem }) {
  const itemType = item.itemType as VaultType;
  const p = item.plaintext;

  if (itemType === 'note') {
    return (
      <span className="vault__cardUser vault__cardUser--note">
        •••••• 보안 메모 — 클릭해 열기
      </span>
    );
  }
  if (itemType === 'card') {
    const last4 = p.cardNumber ? p.cardNumber.replace(/\s/g, '').slice(-4) : '••••';
    return (
      <span className="vault__cardUser vault__cardUser--mono">
        •••• {last4}
        {p.cardholderName && <span className="vault__cardSep"> · </span>}
        {p.cardholderName}
        {p.cardExpiry && <span className="vault__cardSep"> · </span>}
        {p.cardExpiry}
      </span>
    );
  }
  if (itemType === 'wifi') {
    return (
      <span className="vault__cardUser vault__cardUser--mono">
        {p.ssid || p.name}
        {p.wifiSecurity && p.wifiSecurity !== 'open' && (
          <>
            <span className="vault__cardSep"> · </span>
            {p.wifiSecurity}
          </>
        )}
      </span>
    );
  }
  if (itemType === 'apikey') {
    const env = p.apiEnvironment ?? 'other';
    return (
      <span className="vault__cardUser vault__cardUser--mono">
        <span className={`vault__envChip vault__envChip--${env === 'production' ? 'danger' : env === 'staging' ? 'warning' : 'neutral'}`}>
          {env === 'production' ? 'PROD' : env === 'staging' ? 'STG' : env === 'development' ? 'DEV' : 'OTH'}
        </span>
        {p.apiKeyId && (
          <>
            <span className="vault__cardSep">{' '}</span>
            <span className="vault__apiKeyId">
              {p.apiKeyId.length > 14 ? p.apiKeyId.slice(0, 6) + '…' + p.apiKeyId.slice(-4) : p.apiKeyId}
            </span>
          </>
        )}
        {!p.apiKeyId && (
          <>
            <span className="vault__cardSep">{' '}</span>
            <span className="vault__cardSubname">•••••• Secret 숨김</span>
          </>
        )}
      </span>
    );
  }
  // login
  return (
    <span className="vault__cardUser">
      {p.alias && (
        <span className="vault__cardSubname">{p.alias}</span>
      )}
      {p.alias && p.username && ' · '}
      {p.username}
    </span>
  );
}

function cardTypeLabel(item: DecryptedVaultItem): string {
  const t = item.itemType as VaultType;
  switch (t) {
    case 'note': return '메모';
    case 'card': return '카드';
    case 'wifi': return 'WIFI';
    case 'apikey': return 'API';
    default: return CATEGORY_LABELS[item.plaintext.category] ?? '항목';
  }
}

/* ========================================================================
   Empty hero (전체 비었을 때)
   ======================================================================== */
function EmptyHero({ itemType }: { itemType: VaultType }) {
  const titles: Record<VaultType, JSX.Element> = {
    login:  <>첫 <em>비밀</em>을<br />{' '}보관해보세요.</>,
    note:   <>첫 <em>보안 메모</em>를<br />{' '}작성해보세요.</>,
    card:   <>첫 <em>카드</em>를<br />{' '}안전하게 잠가보세요.</>,
    wifi:   <>첫 <em>와이파이</em>를<br />{' '}한곳에 모아보세요.</>,
    apikey: <>첫 <em>API Key</em>를<br />{' '}안전하게 보관해보세요.</>,
  };
  return <h1 className="vault__heroTitle">{titles[itemType]}</h1>;
}

/* ========================================================================
   EmptyState (vault__content 안 — CTA 카드)
   ======================================================================== */
function EmptyState({ itemType, onAdd }: { itemType: VaultType; onAdd: () => void }) {
  const meta: Record<VaultType, { title: string; body: string; cta: string; Icon: React.ComponentType<{ size?: number }> }> = {
    login: {
      title: '아직 보관된 패스워드가 없어요',
      body:  '카탈로그에서 서비스를 고르거나 직접 입력해 등록할 수 있어요.',
      cta:   '+ 첫 패스워드 등록하기',
      Icon:  ItemTypeKeyIcon,
    },
    note: {
      title: '아직 작성된 메모가 없어요',
      body:  '와이파이 비번, 보안 질문 답… 자유 텍스트로 안전하게 저장하세요.',
      cta:   '+ 첫 메모 작성하기',
      Icon:  ItemTypeNoteIcon,
    },
    card: {
      title: '신용카드 정보를 안전하게 잠가두세요',
      body:  '카드번호·CVV·PIN을 client-side AES-GCM으로 암호화해 보관합니다.',
      cta:   '+ 첫 카드 등록하기',
      Icon:  ItemTypeCardIcon,
    },
    wifi: {
      title: '와이파이 비밀번호 한곳에 모으기',
      body:  '저장된 SSID와 비밀번호로 즉시 QR 코드 생성 — 가족·친구와 공유.',
      cta:   '+ 첫 와이파이 등록하기',
      Icon:  ItemTypeWifiIcon,
    },
    apikey: {
      title: 'API 키와 시크릿 보호',
      body:  '환경별(production/staging/development) 색상 코딩 + 만료일 알림.',
      cta:   '+ 첫 API Key 등록하기',
      Icon:  ItemTypeApiIcon,
    },
  };
  const m = meta[itemType];
  return (
    <div className="vault__empty">
      <div className="vault__emptyIcon" aria-hidden>
        <m.Icon size={36} />
      </div>
      <p className="vault__emptyTitle">{m.title}</p>
      <p className="vault__emptyBody">{m.body}</p>
      <button
        type="button"
        className="vault__emptyCta"
        onClick={onAdd}
      >
        {m.cta}
      </button>
    </div>
  );
}

function searchPlaceholder(t: VaultType): string {
  switch (t) {
    case 'note':   return '메모 제목·카테고리 검색';
    case 'card':   return '카드 이름·명의자 검색';
    case 'wifi':   return 'SSID·이름 검색';
    case 'apikey': return 'API 이름·환경 검색';
    default:       return '이름·아이디·카테고리 검색';
  }
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
