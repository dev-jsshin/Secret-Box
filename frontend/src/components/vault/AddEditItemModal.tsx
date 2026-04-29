import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { scorePassword } from '../../lib/passwordTools';

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
  const [showExtras, setShowExtras] = useState(false);

  const pwGenAnchorRef = useRef<HTMLDivElement>(null);
  const pwGenPopoverRef = useRef<HTMLDivElement>(null);

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
    setShowPwGen(false);
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
      // 편집 모드 — 추가 정보 중 하나라도 값 있으면 자동 펼침
      const hasExtras = !!(p.alias || p.url || p.notes || p.totpSecret);
      setShowExtras(hasExtras);
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
      setShowExtras(false);
    }
  }, [isOpen, initialItem, initialType]);

  // Popover: 외부 클릭 시 닫기 — anchor(트리거)와 portal 팝오버 둘 다 검사
  useEffect(() => {
    if (!showPwGen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (pwGenAnchorRef.current?.contains(target)) return;
      if (pwGenPopoverRef.current?.contains(target)) return;
      setShowPwGen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowPwGen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc, true);
    };
  }, [showPwGen]);

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

  // ---------- aria-label용 (Modal title prop) ----------
  const ariaTitle =
    step === 'pick'
      ? '서비스 선택'
      : isEdit
      ? (itemType === 'note' ? '메모 수정' : '항목 수정')
      : (itemType === 'note' ? '새 보안 메모' : '새 자격 증명');

  // ---------- 헤더 카피 ----------
  const headerEyebrow =
    step === 'pick' ? 'STEP 01 — DISCOVER' :
    itemType === 'note' ? 'SECURE NOTE' :
    isEdit ? 'EDIT CREDENTIAL' :
    selectedFromCatalog ? 'NEW CREDENTIAL' :
    'CUSTOM CREDENTIAL';

  const headerTitle =
    step === 'pick' ? <>어떤 <em>서비스</em>인가요?</> :
    itemType === 'note' ? (isEdit ? '메모 수정' : <>새 <em>보안 메모</em></>) :
    isEdit ? '항목 수정' :
    selectedFromCatalog ? selectedFromCatalog.name :
    '직접 입력';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={ariaTitle}>
      <div className="ai">
        <header className="ai__head">
          <span className="ai__eyebrow">{headerEyebrow}</span>
          <h2 className="ai__title">{headerTitle}</h2>
        </header>

        {step === 'pick' && (
          <PickerView
            search={pickSearch}
            onSearch={setPickSearch}
            results={filteredCatalog}
            onPick={handlePickService}
            onCustom={handlePickCustom}
          />
        )}

        {step === 'form' && (
          <form className="ai__form" onSubmit={handleSubmit} noValidate>
            {itemType === 'login' ? (
              <LoginFormView
                isEdit={isEdit}
                name={name} setName={setName}
                alias={alias} setAlias={setAlias}
                category={category} setCategory={setCategory}
                username={username} setUsername={setUsername}
                password={password} setPassword={setPassword}
                url={url} setUrl={setUrl}
                notes={notes} setNotes={setNotes}
                totpSecret={totpSecret} totpError={totpError}
                onTotpChange={handleTotpChange}
                selectedFromCatalog={selectedFromCatalog}
                onChangeService={() => setStep('pick')}
                showPwGen={showPwGen} setShowPwGen={setShowPwGen}
                pwGenAnchorRef={pwGenAnchorRef}
                pwGenPopoverRef={pwGenPopoverRef}
                showExtras={showExtras} setShowExtras={setShowExtras}
              />
            ) : (
              <NoteFormView
                isEdit={isEdit}
                name={name} setName={setName}
                category={category} setCategory={setCategory}
                content={content} setContent={setContent}
              />
            )}

            <footer className="ai__foot">
              <button
                type="button"
                className="ai__cancel"
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
            </footer>
          </form>
        )}
      </div>
    </Modal>
  );
}

/* ========================================================================
   PickerView — 서비스 검색 + 그리드 + 직접 입력
   ======================================================================== */
interface PickerViewProps {
  search: string;
  onSearch: (s: string) => void;
  results: ServiceCatalogItem[];
  onPick: (item: ServiceCatalogItem) => void;
  onCustom: () => void;
}

function PickerView({ search, onSearch, results, onPick, onCustom }: PickerViewProps) {
  return (
    <div className="ai-pick">
      <div className="ai-pick__searchWrap">
        <SearchIcon className="ai-pick__searchIcon" />
        <input
          type="search"
          className="ai-pick__searchInput"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="서비스 이름 검색"
          autoFocus
        />
        <kbd className="ai-pick__searchHint">{results.length}</kbd>
      </div>

      {results.length > 0 ? (
        <div className="ai-pick__grid" role="list">
          {results.map((item) => (
            <button
              key={item.slug}
              type="button"
              className="ai-pick__cell"
              onClick={() => onPick(item)}
              role="listitem"
            >
              <Avatar
                name={item.name}
                iconUrl={item.iconUrl}
                brandColor={item.brandColor}
                size={36}
              />
              <span className="ai-pick__cellName">{item.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="ai-pick__empty">
          <span className="ai-pick__emptyText">
            <strong>"{search}"</strong>에 해당하는 서비스 없음
          </span>
        </div>
      )}

      <button type="button" className="ai-pick__custom" onClick={onCustom}>
        <span className="ai-pick__customMark">+</span>
        <div className="ai-pick__customText">
          <span className="ai-pick__customTitle">직접 입력으로 진행</span>
          <span className="ai-pick__customSub">목록에 없는 서비스나 사용자 지정 항목</span>
        </div>
        <ArrowRightIcon className="ai-pick__customArrow" />
      </button>
    </div>
  );
}

/* ========================================================================
   LoginFormView — 자격 증명 폼 (identity strip + 기본/추가 정보 섹션)
   ======================================================================== */
interface LoginFormViewProps {
  isEdit: boolean;
  name: string; setName: (v: string) => void;
  alias: string; setAlias: (v: string) => void;
  category: CategorySlug; setCategory: (v: CategorySlug) => void;
  username: string; setUsername: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  url: string; setUrl: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  totpSecret: string; totpError: string;
  onTotpChange: (v: string) => void;
  selectedFromCatalog?: ServiceCatalogItem;
  onChangeService: () => void;
  showPwGen: boolean; setShowPwGen: (v: boolean | ((p: boolean) => boolean)) => void;
  pwGenAnchorRef: React.RefObject<HTMLDivElement>;
  pwGenPopoverRef: React.RefObject<HTMLDivElement>;
  showExtras: boolean; setShowExtras: (v: boolean | ((p: boolean) => boolean)) => void;
}

function LoginFormView(p: LoginFormViewProps) {
  const strength = scorePassword(p.password);
  const extrasFilled =
    [p.alias, p.url, p.notes, p.totpSecret].filter((v) => v.trim()).length;

  // Popover 위치 — anchor(.ai-pw)의 viewport 좌표로 계산. portal로 body에 렌더되므로
  // .sb-modal__card의 overflow에 영향 없음 (스크롤바 안 생김).
  // 모바일은 CSS @media에서 fixed bottom sheet로 override.
  const [popPos, setPopPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!p.showPwGen) {
      setPopPos(null);
      return;
    }
    const updatePos = () => {
      const a = p.pwGenAnchorRef.current;
      if (!a) return;
      const rect = a.getBoundingClientRect();
      setPopPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    // capture로 잡아 모달 내부 스크롤도 감지
    document.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      document.removeEventListener('scroll', updatePos, true);
    };
  }, [p.showPwGen, p.pwGenAnchorRef]);

  return (
    <>
      {/* Identity strip */}
      <div className="ai-id">
        <Avatar
          name={p.name || '?'}
          iconUrl={p.selectedFromCatalog?.iconUrl}
          brandColor={p.selectedFromCatalog?.brandColor}
          size={40}
        />
        <div className="ai-id__info">
          <span className="ai-id__name">
            {p.name || (p.selectedFromCatalog ? p.selectedFromCatalog.name : '직접 입력')}
          </span>
          <span className="ai-id__hint">
            {p.selectedFromCatalog ? '카탈로그' :
             p.isEdit ? '저장된 항목' : '사용자 지정'}
          </span>
        </div>
        {!p.isEdit && (
          <button
            type="button"
            className="ai-id__change"
            onClick={p.onChangeService}
          >
            변경
          </button>
        )}
      </div>

      {/* Section 01 — 기본 정보 */}
      <section className="ai-sec">
        <SectionLabel num="01" title="기본 정보" />
        <div className="ai-sec__body">
          {!p.selectedFromCatalog && (
            <FormField
              id="ai-name"
              label="이름"
              placeholder="예: 회사 인트라넷"
              value={p.name}
              onChange={(e) => p.setName(e.target.value)}
            />
          )}

          <FormField
            id="ai-username"
            label="아이디"
            placeholder="이메일 또는 사용자명"
            value={p.username}
            onChange={(e) => p.setUsername(e.target.value)}
            copyable
          />

          <div className="ai-pw" ref={p.pwGenAnchorRef}>
            <FormField
              id="ai-password"
              type="password"
              label="비밀번호"
              placeholder="••••••••"
              value={p.password}
              onChange={(e) => p.setPassword(e.target.value)}
              copyable
              hint={
                <span className="ai-pw__hintRow">
                  {p.password ? (
                    <span className={'ai-pw__strength is-tone-' + strength.score}>
                      <span className="ai-pw__strengthBars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span
                            key={n}
                            className={
                              'ai-pw__strengthBar'
                              + (strength.score >= n ? ' is-on' : '')
                            }
                          />
                        ))}
                      </span>
                      <span className="ai-pw__strengthLabel">{strength.label}</span>
                    </span>
                  ) : (
                    <span className="ai-pw__hintEmpty">강도</span>
                  )}
                  <button
                    type="button"
                    className={
                      'ai-pw__trigger'
                      + (p.showPwGen ? ' is-on' : '')
                    }
                    onClick={() => p.setShowPwGen((v) => !v)}
                    aria-pressed={p.showPwGen}
                    aria-controls="ai-pw-popover"
                  >
                    <SparkIcon />
                    <span>{p.showPwGen ? '닫기' : '자동 생성'}</span>
                  </button>
                </span>
              }
            />
          </div>

          {/* Popover — Portal로 body에 렌더 → 모달 스크롤 영향 X */}
          {p.showPwGen && createPortal(
            <div
              id="ai-pw-popover"
              ref={p.pwGenPopoverRef}
              className="ai-pw__popover"
              role="dialog"
              aria-label="패스워드 생성기"
              style={popPos ? { top: popPos.top, right: popPos.right } : undefined}
            >
              <div className="ai-pw__popoverHead">
                <span className="ai-pw__popoverTitle">패스워드 생성</span>
                <button
                  type="button"
                  className="ai-pw__popoverClose"
                  onClick={() => p.setShowPwGen(false)}
                  aria-label="생성기 닫기"
                >
                  <CloseIcon />
                </button>
              </div>
              <PasswordGenerator onGenerate={(pw) => p.setPassword(pw)} />
            </div>,
            document.body,
          )}
        </div>
      </section>

      {/* Section 02 — 추가 정보 (collapsible) */}
      <section className={'ai-sec ai-sec--extras' + (p.showExtras ? ' is-open' : '')}>
        <button
          type="button"
          className="ai-sec__toggle"
          onClick={() => p.setShowExtras((v) => !v)}
          aria-expanded={p.showExtras}
        >
          <span className="ai-sec__num">02</span>
          <span className="ai-sec__title">추가 정보</span>
          <span className="ai-sec__meta">
            {extrasFilled > 0 ? (
              <span className="ai-sec__metaCount">{extrasFilled}개 입력됨</span>
            ) : (
              <span className="ai-sec__metaList">별칭 · URL · 2FA · 메모</span>
            )}
          </span>
          <ChevronIcon className="ai-sec__chevron" />
        </button>

        {p.showExtras && (
          <div className="ai-sec__body ai-sec__body--extras">
            <FormField
              id="ai-alias"
              label="별칭"
              placeholder={p.selectedFromCatalog ? '예: 회사, 개인' : '(선택)'}
              value={p.alias}
              onChange={(e) => p.setAlias(e.target.value)}
              hint="같은 서비스 여러 계정을 구분 (예: 네이버 — 회사 / 개인)"
            />

            <div className="ai-field">
              <label className="ai-field__label">
                카테고리
                {p.selectedFromCatalog && (
                  <span className="ai-field__lockHint">카탈로그 지정 · 수정 불가</span>
                )}
              </label>
              <div className="ai-field__selectWrap">
                <select
                  className="ai-field__select"
                  value={p.category}
                  onChange={(e) => p.setCategory(e.target.value as CategorySlug)}
                  disabled={!!p.selectedFromCatalog}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <ChevronIcon className="ai-field__selectChevron" />
              </div>
            </div>

            <FormField
              id="ai-url"
              type="url"
              label="URL"
              placeholder="https://..."
              value={p.url}
              onChange={(e) => p.setUrl(e.target.value)}
            />

            <FormField
              id="ai-totp"
              type="password"
              label="2FA secret"
              placeholder="otpauth:// URL 또는 base32 secret"
              value={p.totpSecret}
              onChange={(e) => p.onTotpChange(e.target.value)}
              error={p.totpError}
              hint="QR과 같이 표시되는 secret · 30초 회전 코드를 카드에 표시"
            />

            <div className="ai-field">
              <label className="ai-field__label">메모</label>
              <textarea
                className="ai-field__textarea"
                value={p.notes}
                onChange={(e) => p.setNotes(e.target.value)}
                rows={3}
                placeholder="(선택) 추가 메모"
              />
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/* ========================================================================
   NoteFormView — 보안 메모 (제목 + 카테고리 + 내용)
   ======================================================================== */
interface NoteFormViewProps {
  isEdit: boolean;
  name: string; setName: (v: string) => void;
  category: CategorySlug; setCategory: (v: CategorySlug) => void;
  content: string; setContent: (v: string) => void;
}

function NoteFormView(p: NoteFormViewProps) {
  return (
    <div className="ai-note">
      <FormField
        id="ai-note-name"
        label="제목"
        placeholder="예: 와이파이 비밀번호, 보안 질문"
        value={p.name}
        onChange={(e) => p.setName(e.target.value)}
      />

      <div className="ai-field ai-field--inline">
        <label className="ai-field__label">카테고리</label>
        <div className="ai-field__selectWrap ai-field__selectWrap--inline">
          <select
            className="ai-field__select"
            value={p.category}
            onChange={(e) => p.setCategory(e.target.value as CategorySlug)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <ChevronIcon className="ai-field__selectChevron" />
        </div>
      </div>

      <div className="ai-field">
        <div className="ai-note__contentLabel">
          <span className="ai-field__label">내용</span>
          <span className="ai-note__counter">{p.content.length}자</span>
        </div>
        <textarea
          className="ai-field__textarea ai-field__textarea--note"
          value={p.content}
          onChange={(e) => p.setContent(e.target.value)}
          rows={9}
          placeholder="자유롭게 입력하세요. 모든 내용은 클라이언트에서 암호화됩니다."
          autoFocus={!p.isEdit}
        />
      </div>
    </div>
  );
}

/* ========================================================================
   Section label helper
   ======================================================================== */
function SectionLabel({ num, title }: { num: string; title: string }) {
  return (
    <div className="ai-sec__label">
      <span className="ai-sec__num">{num}</span>
      <span className="ai-sec__title">{title}</span>
      <span className="ai-sec__rule" aria-hidden />
    </div>
  );
}

/* ========================================================================
   Inline icons
   ======================================================================== */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.5" y2="16.5" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
