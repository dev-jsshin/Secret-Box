import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Modal from '../Modal';
import Button from '../Button';
import FormField from '../FormField';
import PasswordGenerator from '../PasswordGenerator';
import Avatar from './Avatar';

import {
  CATEGORY_LABELS,
  catalogApi,
  type CategorySlug,
  type ServiceCatalogItem,
} from '../../api/catalog';
import { vaultApi } from '../../api/vault';
import { ApiError } from '../../api/client';
import { bytesToBase64 } from '../../crypto/base64';
import { encryptJson } from '../../crypto/cipher';
import { useSessionStore } from '../../store/session';
import type { DecryptedVaultItem, VaultItemPlaintext } from '../../types/vault';
import { isValidBase32, parseOtpAuthUri } from '../../lib/totp';

import './AddEditItemModal.css';

interface AddEditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: DecryptedVaultItem | null;
  /** 새 항목 생성 시 미리 정해진 타입 — 'note'면 picker 건너뛰고 바로 메모 폼으로 진입 */
  initialType?: 'login' | 'note';
  onError?: (msg: string) => void;
}

const CATEGORIES: CategorySlug[] = [
  'social', 'work', 'finance', 'shopping', 'media', 'dev', 'gaming', 'other',
];

type Step = 'pick' | 'form';
type ItemType = 'login' | 'note';

export default function AddEditItemModal({
  isOpen,
  onClose,
  initialItem,
  initialType,
  onError,
}: AddEditItemModalProps) {
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const isEdit = !!initialItem;

  const [step, setStep] = useState<Step>('pick');
  const [pickSearch, setPickSearch] = useState('');

  const [itemType, setItemType] = useState<ItemType>('login');
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [catalogSlug, setCatalogSlug] = useState<string | undefined>();
  const [category, setCategory] = useState<CategorySlug>('other');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [content, setContent] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpError, setTotpError] = useState('');
  const [showPwGen, setShowPwGen] = useState(false);

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

  const selectedFromCatalog = catalogSlug ? catalogMap.get(catalogSlug) : undefined;

  const filteredCatalog = useMemo(() => {
    const list = catalog?.services ?? [];
    if (!pickSearch.trim()) return list;
    const q = pickSearch.toLowerCase().trim();
    return list.filter((s) =>
      s.name.toLowerCase().includes(q)
      || s.nameEn?.toLowerCase().includes(q)
      || s.aliases.some((a) => a.toLowerCase().includes(q))
      || CATEGORY_LABELS[s.category].includes(q),
    );
  }, [catalog, pickSearch]);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (!isOpen) return;
    setPickSearch('');
    setTotpError('');
    if (initialItem) {
      const p = initialItem.plaintext;
      setItemType(initialItem.itemType === 'note' ? 'note' : 'login');
      setName(p.name);
      setAlias(p.alias ?? '');
      setCatalogSlug(p.catalogSlug);
      setCategory(p.category);
      setUsername(p.username ?? '');
      setPassword(p.password ?? '');
      setUrl(p.url ?? '');
      setNotes(p.notes ?? '');
      setContent(p.content ?? '');
      setTotpSecret(p.totpSecret ?? '');
      setStep('form');
    } else {
      // 새 항목 — initialType === 'note'면 picker 건너뛰고 바로 메모 폼
      const startAsNote = initialType === 'note';
      setItemType(startAsNote ? 'note' : 'login');
      setName('');
      setAlias('');
      setCatalogSlug(undefined);
      setCategory('other');
      setUsername('');
      setPassword('');
      setUrl('');
      setNotes('');
      setContent('');
      setTotpSecret('');
      setStep(startAsNote ? 'form' : 'pick');
    }
  }, [isOpen, initialItem, initialType]);

  /**
   * TOTP 입력 처리:
   *   - otpauth:// URI를 붙여넣으면 secret만 추출해서 채움
   *   - 그 외엔 raw base32로 취급, 즉시 검증
   */
  function handleTotpChange(value: string) {
    const trimmed = value.trim();
    if (trimmed.startsWith('otpauth://')) {
      const parsed = parseOtpAuthUri(trimmed);
      if (parsed) {
        setTotpSecret(parsed.secret);
        setTotpError('');
        return;
      }
      setTotpSecret(trimmed);
      setTotpError('otpauth URL을 해석할 수 없습니다.');
      return;
    }
    setTotpSecret(trimmed);
    if (trimmed && !isValidBase32(trimmed)) {
      setTotpError('base32 형식만 가능합니다 (A–Z, 2–7).');
    } else {
      setTotpError('');
    }
  }

  function handlePickService(item: ServiceCatalogItem) {
    setItemType('login');
    setName(item.name);
    setCatalogSlug(item.slug);
    setCategory(item.category);
    if (item.defaultUrl) setUrl(item.defaultUrl);
    setStep('form');
  }

  function handlePickCustom() {
    setItemType('login');
    setName('');
    setCatalogSlug(undefined);
    setCategory('other');
    setUrl('');
    setStep('form');
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dek) throw new Error('NO_DEK');

      let plaintext: VaultItemPlaintext;
      if (itemType === 'note') {
        plaintext = {
          name: name.trim(),
          category,
          content: content.trim(),
          favorite: initialItem?.plaintext.favorite,
        };
      } else {
        const cleanedTotp = totpSecret.trim().toUpperCase().replace(/[\s-]/g, '');
        plaintext = {
          name: name.trim(),
          alias: alias.trim() || undefined,
          catalogSlug,
          category,
          username: username.trim(),
          password,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
          totpSecret: cleanedTotp || undefined,
          favorite: initialItem?.plaintext.favorite,
        };
      }

      const { ciphertext, iv } = await encryptJson(dek, plaintext);
      const body = {
        encryptedData: bytesToBase64(ciphertext),
        encryptedIv: bytesToBase64(iv),
      };
      if (isEdit && initialItem) {
        return vaultApi.update(initialItem.id, {
          ...body,
          expectedVersion: initialItem.version,
        });
      }
      return vaultApi.create({ itemType, ...body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      onClose();
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '저장에 실패했습니다.';
      onError?.(msg);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onError?.(itemType === 'note' ? '제목을 입력해주세요.' : '이름을 입력해주세요.');
      return;
    }
    if (itemType === 'note') {
      if (!content.trim()) {
        onError?.('내용을 입력해주세요.');
        return;
      }
    } else {
      if (!username.trim()) {
        onError?.('아이디를 입력해주세요.');
        return;
      }
      if (!password) {
        onError?.('비밀번호를 입력해주세요.');
        return;
      }
      if (totpError) {
        onError?.('2FA secret 형식을 확인해주세요.');
        return;
      }
    }
    mutation.mutate();
  }

  // ---------- Title decision ----------
  const title =
    step === 'pick'
      ? '항목 추가'
      : isEdit
      ? itemType === 'note' ? '메모 수정' : '항목 수정'
      : itemType === 'note'
      ? '새 보안 메모'
      : selectedFromCatalog
      ? `${selectedFromCatalog.name} 정보`
      : '새 항목 (직접 입력)';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {step === 'pick' && (
        <div className="ai-pick">
          <h2 className="serif-display ai-pick__title">
            어떤 <em>서비스</em>의 패스워드인가요?
          </h2>
          <p className="ai-pick__lede">
            등록된 서비스를 선택하거나, 없으면 직접 입력하세요.
          </p>

          <input
            type="search"
            className="ai-pick__search"
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
            placeholder="이름·카테고리로 검색"
            autoFocus
          />

          {filteredCatalog.length === 0 ? (
            <p className="ai-pick__empty">검색 결과가 없습니다.</p>
          ) : (
            <div className="ai-pick__grid">
              {filteredCatalog.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  className="ai-pick__cell"
                  onClick={() => handlePickService(item)}
                >
                  <Avatar
                    name={item.name}
                    iconUrl={item.iconUrl}
                    brandColor={item.brandColor}
                    size={40}
                  />
                  <span className="ai-pick__cellName">{item.name}</span>
                  <span className="ai-pick__cellCat">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="ai-pick__customRow">
            <span className="ai-pick__customLabel">목록에 없는 서비스인가요?</span>
            <button
              type="button"
              className="ai-pick__customBtn"
              onClick={handlePickCustom}
            >
              직접 입력 →
            </button>
          </div>
        </div>
      )}

      {step === 'form' && (
        <form className="ai-form" onSubmit={handleSubmit} noValidate>
          <header
            className={
              'ai-form__pickedBanner'
              + (itemType === 'note' ? ' ai-form__pickedBanner--note' : '')
            }
          >
            {itemType === 'note' ? (
              <div className="ai-form__noteAvatar" aria-hidden>
                <NoteIcon />
              </div>
            ) : (
              <Avatar
                name={name || '?'}
                iconUrl={selectedFromCatalog?.iconUrl}
                brandColor={selectedFromCatalog?.brandColor}
                size={36}
              />
            )}
            <div className="ai-form__pickedInfo">
              <span className="ai-form__pickedName">
                {itemType === 'note'
                  ? (name || '보안 메모')
                  : (name || (selectedFromCatalog ? selectedFromCatalog.name : '직접 입력'))}
              </span>
              <span className="ai-form__pickedHint">
                {itemType === 'note'
                  ? (isEdit ? '저장된 메모 수정' : '자유 텍스트 메모')
                  : selectedFromCatalog
                  ? '카탈로그에서 선택됨'
                  : isEdit
                  ? '저장된 항목 수정'
                  : '카탈로그에 없는 서비스'}
              </span>
            </div>
            {!isEdit && (
              <button
                type="button"
                className="ai-form__pickedClose"
                onClick={() => setStep('pick')}
                aria-label="이전으로"
                title="이전으로"
              >
                ✕
              </button>
            )}
          </header>

          {/* ===== Note 모드: 제목 + 카테고리 + 큰 textarea ===== */}
          {itemType === 'note' ? (
            <>
              <FormField
                id="ai-note-name"
                label="제목 *"
                placeholder="예: 와이파이 비밀번호, 보안 질문"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="ai-form__field">
                <label className="ai-form__label">카테고리</label>
                <select
                  className="ai-form__select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategorySlug)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              <div className="ai-form__field">
                <label className="ai-form__label">내용 *</label>
                <textarea
                  className="ai-form__textarea ai-form__textarea--note"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={7}
                  placeholder="자유롭게 입력하세요. 모든 내용은 클라이언트에서 암호화됩니다."
                  autoFocus={!isEdit}
                />
              </div>
            </>
          ) : (
          /* ===== Login 모드: 기존 폼 그대로 ===== */
          <>
            {!selectedFromCatalog && (
              <FormField
                id="ai-name"
                label="이름 *"
                placeholder="예: 회사 인트라넷"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <FormField
              id="ai-alias"
              label="별칭"
              placeholder={selectedFromCatalog ? '예: 회사, 개인' : '(선택)'}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              hint="같은 서비스 여러 계정을 구분할 때 (예: 네이버 — 회사 / 개인)"
            />

            <div className="ai-form__field">
              <label className="ai-form__label">
                카테고리
                {selectedFromCatalog && (
                  <span className="ai-form__lockHint"> · 카탈로그 지정 (수정 불가)</span>
                )}
              </label>
              <select
                className="ai-form__select"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategorySlug)}
                disabled={!!selectedFromCatalog}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <FormField
              id="ai-username"
              label="아이디 *"
              placeholder="이메일 또는 사용자명"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              copyable
            />

            <FormField
              id="ai-password"
              type="password"
              label="비밀번호 *"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              copyable
              trailing={
                <button
                  type="button"
                  className={
                    'ai-form__genTrigger'
                    + (showPwGen ? ' is-on' : '')
                  }
                  onClick={() => setShowPwGen((v) => !v)}
                  aria-pressed={showPwGen}
                  aria-controls="pw-generator-panel"
                  title={showPwGen ? '생성기 닫기' : '자동 생성'}
                >
                  자동 생성
                </button>
              }
            />

            {showPwGen && (
              <div id="pw-generator-panel">
                <PasswordGenerator onGenerate={(pw) => setPassword(pw)} />
              </div>
            )}

            <FormField
              id="ai-totp"
              type="password"
              label="2FA secret"
              placeholder="otpauth:// URL 또는 base32 secret"
              value={totpSecret}
              onChange={(e) => handleTotpChange(e.target.value)}
              error={totpError}
              hint={
                <>
                  2FA 등록 시 QR과 같이 표시되는 secret (Google/MS Authenticator 등 표준 TOTP 호환).
                  <br />
                  30초 회전 코드를 카드에 같이 보여줍니다.
                </>
              }
            />

            <FormField
              id="ai-url"
              type="url"
              label="URL"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <div className="ai-form__field">
              <label className="ai-form__label">메모</label>
              <textarea
                className="ai-form__textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="(선택) 메모"
              />
            </div>
          </>
          )}

          <div className="ai-form__actions">
            <button
              type="button"
              className="ai-form__cancel"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              취소
            </button>
            <Button
              type="submit"
              loading={mutation.isPending}
              loadingLabel="암호화 저장 중…"
            >
              {isEdit ? '저장' : itemType === 'note' ? '메모 저장' : '추가'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}
