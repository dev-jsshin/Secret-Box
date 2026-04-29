import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';

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
import type {
  ApiEnvironment,
  DecryptedVaultItem,
  VaultItemPlaintext,
  WifiSecurity,
} from '../../types/vault';
import { isValidBase32, parseOtpAuthUri } from '../../lib/totp';
import { scorePassword } from '../../lib/passwordTools';

import './AddEditItemModal.css';

interface AddEditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: DecryptedVaultItem | null;
  initialType?: ItemType;
  onError?: (msg: string) => void;
}

const CATEGORIES: CategorySlug[] = [
  'social', 'work', 'finance', 'shopping', 'media', 'dev', 'gaming', 'other',
];

type Step = 'pick' | 'form';
export type ItemType = 'login' | 'note' | 'card' | 'wifi' | 'apikey';

const CARD_BRANDS = [
  { value: 'visa',       label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex',       label: 'Amex' },
  { value: 'jcb',        label: 'JCB' },
  { value: 'discover',   label: 'Discover' },
  { value: 'other',      label: '기타' },
] as const;

const WIFI_SECURITIES: { value: WifiSecurity; label: string }[] = [
  { value: 'WPA3',  label: 'WPA3' },
  { value: 'WPA2',  label: 'WPA2' },
  { value: 'WPA',   label: 'WPA' },
  { value: 'WEP',   label: 'WEP' },
  { value: 'open',  label: '암호 없음' },
  { value: 'other', label: '기타' },
];

const API_ENVS: { value: ApiEnvironment; label: string; full: string; tone: string }[] = [
  { value: 'production',  label: 'PROD',  full: 'PRODUCTION',  tone: 'danger'  },
  { value: 'staging',     label: 'STAGING', full: 'STAGING',   tone: 'warning' },
  { value: 'development', label: 'DEV',   full: 'DEVELOPMENT', tone: 'neutral' },
  { value: 'other',       label: 'OTHER', full: 'OTHER',       tone: 'neutral' },
];

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

  // card
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardBrand, setCardBrand] = useState<string>('visa');
  const [cardPin, setCardPin] = useState('');

  // wifi
  const [ssid, setSsid] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>('WPA2');
  const [wifiHidden, setWifiHidden] = useState(false);

  // apikey
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [apiEnvironment, setApiEnvironment] = useState<ApiEnvironment>('production');
  const [apiExpiresAt, setApiExpiresAt] = useState('');

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
      const t = (initialItem.itemType as ItemType) || 'login';
      setItemType(t);
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
      setCardholderName(p.cardholderName ?? '');
      setCardNumber(p.cardNumber ?? '');
      setCardExpiry(p.cardExpiry ?? '');
      setCardCvv(p.cardCvv ?? '');
      setCardBrand(p.cardBrand ?? 'visa');
      setCardPin(p.cardPin ?? '');
      setSsid(p.ssid ?? p.name ?? '');
      setWifiSecurity(p.wifiSecurity ?? 'WPA2');
      setWifiHidden(!!p.wifiHidden);
      setApiKeyId(p.apiKeyId ?? '');
      setApiKeySecret(p.apiKeySecret ?? '');
      setApiEnvironment(p.apiEnvironment ?? 'production');
      setApiExpiresAt(p.apiExpiresAt ?? '');
      setStep('form');
      // 편집 모드 — 추가 정보 중 하나라도 값 있으면 자동 펼침
      const hasExtras = !!(p.alias || p.url || p.notes || p.totpSecret || p.cardPin);
      setShowExtras(hasExtras);
    } else {
      // 새 항목 — initialType이 'login' 외이면 picker 건너뛰고 바로 폼
      const startType: ItemType = initialType ?? 'login';
      setItemType(startType);
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
      setCardholderName('');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardBrand('visa');
      setCardPin('');
      setSsid('');
      setWifiSecurity('WPA2');
      setWifiHidden(false);
      setApiKeyId('');
      setApiKeySecret('');
      setApiEnvironment('production');
      setApiExpiresAt('');
      setStep(startType === 'login' ? 'pick' : 'form');
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
      } else if (itemType === 'card') {
        plaintext = {
          name: name.trim(),
          category,
          cardholderName: cardholderName.trim(),
          cardNumber: cardNumber.replace(/\s/g, ''),
          cardExpiry: cardExpiry.trim(),
          cardCvv: cardCvv.trim(),
          cardBrand: cardBrand || undefined,
          cardPin: cardPin.trim() || undefined,
          notes: notes.trim() || undefined,
          favorite: initialItem?.plaintext.favorite,
        };
      } else if (itemType === 'wifi') {
        plaintext = {
          name: name.trim() || ssid.trim(),
          category,
          ssid: ssid.trim(),
          password,
          wifiSecurity,
          wifiHidden: wifiHidden || undefined,
          notes: notes.trim() || undefined,
          favorite: initialItem?.plaintext.favorite,
        };
      } else if (itemType === 'apikey') {
        plaintext = {
          name: name.trim(),
          category,
          apiKeyId: apiKeyId.trim() || undefined,
          apiKeySecret: apiKeySecret,
          apiEnvironment,
          apiExpiresAt: apiExpiresAt || undefined,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
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
      queryClient.invalidateQueries({ queryKey: ['vault-counts'] });
      onClose();
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '저장에 실패했습니다.';
      onError?.(msg);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (itemType === 'note') {
      if (!name.trim()) { onError?.('제목을 입력해주세요.'); return; }
      if (!content.trim()) { onError?.('내용을 입력해주세요.'); return; }
    } else if (itemType === 'card') {
      if (!name.trim()) { onError?.('카드 이름을 입력해주세요.'); return; }
      if (!cardholderName.trim()) { onError?.('카드 명의자를 입력해주세요.'); return; }
      const cleanedNum = cardNumber.replace(/\s/g, '');
      const expectedLen = cardBrand === 'amex' ? 15 : null;
      if (!cleanedNum || !/^\d{12,19}$/.test(cleanedNum)) {
        onError?.('카드번호를 확인해주세요. (숫자 12~19자리)'); return;
      }
      if (expectedLen && cleanedNum.length !== expectedLen) {
        onError?.(`Amex 카드번호는 15자리입니다.`); return;
      }
      if (!cardExpiry.trim() || !/^\d{2}\/\d{2}$/.test(cardExpiry.trim())) {
        onError?.('유효기간을 MM/YY 형식으로 입력해주세요.'); return;
      }
      const cvvLen = cardBrand === 'amex' ? 4 : 3;
      if (!cardCvv.trim() || cardCvv.length !== cvvLen) {
        onError?.(`${cardBrand === 'amex' ? 'CID(4자리)' : 'CVV(3자리)'}를 확인해주세요.`); return;
      }
    } else if (itemType === 'wifi') {
      if (!ssid.trim()) { onError?.('SSID를 입력해주세요.'); return; }
      if (wifiSecurity !== 'open' && !password) {
        onError?.('비밀번호를 입력해주세요.'); return;
      }
    } else if (itemType === 'apikey') {
      if (!name.trim()) { onError?.('이름을 입력해주세요.'); return; }
      if (!apiKeySecret) { onError?.('Secret을 입력해주세요.'); return; }
    } else {
      if (!name.trim()) { onError?.('이름을 입력해주세요.'); return; }
      if (!username.trim()) { onError?.('아이디를 입력해주세요.'); return; }
      if (!password) { onError?.('비밀번호를 입력해주세요.'); return; }
      if (totpError) { onError?.('2FA secret 형식을 확인해주세요.'); return; }
    }
    mutation.mutate();
  }

  // ---------- aria-label용 ----------
  const ariaTitle =
    step === 'pick' ? '서비스 선택' :
    isEdit
      ? `${TYPE_KO[itemType]} 수정`
      : `새 ${TYPE_KO[itemType]}`;

  // ---------- 헤더 카피 ----------
  const headerEyebrow =
    step === 'pick' ? 'STEP 01 — DISCOVER' :
    isEdit ? `EDIT ${TYPE_EYEBROW[itemType]}` : `NEW ${TYPE_EYEBROW[itemType]}`;

  const headerTitle =
    step === 'pick' ? <>어떤 <em>서비스</em>인가요?</> :
    itemType === 'login' && !isEdit && selectedFromCatalog ? selectedFromCatalog.name :
    isEdit ? `${TYPE_KO[itemType]} 수정` :
    typeNewTitle(itemType);

  const submitLabel = isEdit ? '저장' : `${TYPE_KO[itemType]} 추가`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={ariaTitle}>
      <div className={`ai ai--${itemType}`}>
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
            {itemType === 'login' && (
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
            )}
            {itemType === 'note' && (
              <NoteFormView
                isEdit={isEdit}
                name={name} setName={setName}
                category={category} setCategory={setCategory}
                content={content} setContent={setContent}
              />
            )}
            {itemType === 'card' && (
              <CardFormView
                name={name} setName={setName}
                cardholderName={cardholderName} setCardholderName={setCardholderName}
                cardNumber={cardNumber} setCardNumber={setCardNumber}
                cardExpiry={cardExpiry} setCardExpiry={setCardExpiry}
                cardCvv={cardCvv} setCardCvv={setCardCvv}
                cardBrand={cardBrand} setCardBrand={setCardBrand}
                cardPin={cardPin} setCardPin={setCardPin}
                category={category} setCategory={setCategory}
                notes={notes} setNotes={setNotes}
                showExtras={showExtras} setShowExtras={setShowExtras}
              />
            )}
            {itemType === 'wifi' && (
              <WifiFormView
                name={name} setName={setName}
                ssid={ssid} setSsid={setSsid}
                password={password} setPassword={setPassword}
                wifiSecurity={wifiSecurity} setWifiSecurity={setWifiSecurity}
                wifiHidden={wifiHidden} setWifiHidden={setWifiHidden}
                category={category} setCategory={setCategory}
                notes={notes} setNotes={setNotes}
                showExtras={showExtras} setShowExtras={setShowExtras}
              />
            )}
            {itemType === 'apikey' && (
              <ApiKeyFormView
                name={name} setName={setName}
                apiKeyId={apiKeyId} setApiKeyId={setApiKeyId}
                apiKeySecret={apiKeySecret} setApiKeySecret={setApiKeySecret}
                apiEnvironment={apiEnvironment} setApiEnvironment={setApiEnvironment}
                apiExpiresAt={apiExpiresAt} setApiExpiresAt={setApiExpiresAt}
                url={url} setUrl={setUrl}
                category={category} setCategory={setCategory}
                notes={notes} setNotes={setNotes}
                showExtras={showExtras} setShowExtras={setShowExtras}
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
                {submitLabel}
              </Button>
            </footer>
          </form>
        )}
      </div>
    </Modal>
  );
}

const TYPE_KO: Record<ItemType, string> = {
  login: '자격 증명',
  note: '보안 메모',
  card: '카드',
  wifi: '와이파이',
  apikey: 'API Key',
};

const TYPE_EYEBROW: Record<ItemType, string> = {
  login: 'CREDENTIAL',
  note: 'SECURE NOTE',
  card: 'PAYMENT CARD',
  wifi: 'WI-FI NETWORK',
  apikey: 'API SECRET',
};

function typeNewTitle(t: ItemType): JSX.Element {
  switch (t) {
    case 'note':   return <>새 <em>보안 메모</em></>;
    case 'card':   return <>새 <em>카드</em></>;
    case 'wifi':   return <>새 <em>와이파이</em></>;
    case 'apikey': return <>새 <em>API Key</em></>;
    default:       return <>직접 입력</>;
  }
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
   LoginFormView — 자격 증명 폼
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
    document.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      document.removeEventListener('scroll', updatePos, true);
    };
  }, [p.showPwGen, p.pwGenAnchorRef]);

  return (
    <>
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

            <CategorySelect value={p.category} onChange={p.setCategory} disabled={!!p.selectedFromCatalog} lockHint={!!p.selectedFromCatalog} />

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

            <NotesField value={p.notes} onChange={p.setNotes} />
          </div>
        )}
      </section>
    </>
  );
}

/* ========================================================================
   NoteFormView — 보안 메모
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
   CardFormView — 신용카드 (라이브 카드 미리보기 + 폼)
   ======================================================================== */
interface CardFormViewProps {
  name: string; setName: (v: string) => void;
  cardholderName: string; setCardholderName: (v: string) => void;
  cardNumber: string; setCardNumber: (v: string) => void;
  cardExpiry: string; setCardExpiry: (v: string) => void;
  cardCvv: string; setCardCvv: (v: string) => void;
  cardBrand: string; setCardBrand: (v: string) => void;
  cardPin: string; setCardPin: (v: string) => void;
  category: CategorySlug; setCategory: (v: CategorySlug) => void;
  notes: string; setNotes: (v: string) => void;
  showExtras: boolean; setShowExtras: (v: boolean | ((p: boolean) => boolean)) => void;
}

function CardFormView(p: CardFormViewProps) {
  const extrasFilled = [p.cardPin, p.notes].filter((v) => v.trim()).length;

  function handleNumberChange(v: string) {
    p.setCardNumber(formatCardNumber(v, p.cardBrand));
  }

  // 카드사 변경 시 카드번호 띄어쓰기를 새 표준에 맞게 재포맷 + CVV 길이 조정
  function handleBrandChange(brand: string) {
    p.setCardBrand(brand);
    if (p.cardNumber) {
      p.setCardNumber(formatCardNumber(p.cardNumber, brand));
    }
    // Amex는 CVV가 4자리 — 다른 카드는 3자리
    const maxCvv = brand === 'amex' ? 4 : 3;
    if (p.cardCvv.length > maxCvv) {
      p.setCardCvv(p.cardCvv.slice(0, maxCvv));
    }
  }

  function handleExpiryChange(v: string) {
    // MM/YY 자동 슬래시
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      p.setCardExpiry(digits);
    } else {
      p.setCardExpiry(`${digits.slice(0, 2)}/${digits.slice(2)}`);
    }
  }

  function handleCvvChange(v: string, brand: string) {
    const max = brand === 'amex' ? 4 : 3;
    p.setCardCvv(v.replace(/\D/g, '').slice(0, max));
  }

  return (
    <>
      {/* 라이브 카드 미리보기 */}
      <CardPreview
        brand={p.cardBrand}
        number={p.cardNumber}
        holder={p.cardholderName}
        expiry={p.cardExpiry}
      />

      <section className="ai-sec">
        <SectionLabel num="01" title="카드 정보" />
        <div className="ai-sec__body">
          <FormField
            id="ai-card-name"
            label="이름 / 별칭"
            placeholder="예: 신한카드 메인, 회사 법카"
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            autoFocus
          />

          {/* 카드사 — select 드롭다운. 신용/체크 무관, 네트워크 기준. */}
          <div className="ai-field">
            <label className="ai-field__label">카드 네트워크</label>
            <div className="ai-field__selectWrap">
              <select
                className="ai-field__select"
                value={p.cardBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                aria-label="카드 네트워크"
              >
                {CARD_BRANDS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              <ChevronIcon className="ai-field__selectChevron" />
            </div>
            <span className="ai-field__hint">신용/체크 무관 · 카드 앞면 로고 기준</span>
          </div>

          <FormField
            id="ai-card-holder"
            label="카드 명의자"
            placeholder="예: KIM JUN SEOB"
            value={p.cardholderName}
            onChange={(e) => p.setCardholderName(e.target.value.toUpperCase())}
          />

          <FormField
            id="ai-card-number"
            label="카드번호"
            placeholder={cardNumberPlaceholder(p.cardBrand)}
            value={p.cardNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            inputMode="numeric"
            autoComplete="cc-number"
            copyable
            hint={cardBrandHint(p.cardBrand)}
          />

          {/* MM/YY + CVV 한 줄 */}
          <div className="ai-row2">
            <FormField
              id="ai-card-expiry"
              label="유효기간"
              placeholder="MM/YY"
              value={p.cardExpiry}
              onChange={(e) => handleExpiryChange(e.target.value)}
              inputMode="numeric"
              autoComplete="cc-exp"
            />
            <FormField
              id="ai-card-cvv"
              type="password"
              label={p.cardBrand === 'amex' ? 'CID' : 'CVV'}
              placeholder={p.cardBrand === 'amex' ? '••••' : '•••'}
              value={p.cardCvv}
              onChange={(e) => handleCvvChange(e.target.value, p.cardBrand)}
              inputMode="numeric"
              autoComplete="cc-csc"
            />
          </div>
        </div>
      </section>

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
              <span className="ai-sec__metaList">PIN · 카테고리 · 메모</span>
            )}
          </span>
          <ChevronIcon className="ai-sec__chevron" />
        </button>

        {p.showExtras && (
          <div className="ai-sec__body ai-sec__body--extras">
            <FormField
              id="ai-card-pin"
              type="password"
              label="PIN (선택)"
              placeholder="••••"
              value={p.cardPin}
              onChange={(e) => p.setCardPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
            />

            <CategorySelect value={p.category} onChange={p.setCategory} />

            <NotesField value={p.notes} onChange={p.setNotes} />
          </div>
        )}
      </section>
    </>
  );
}

/* ========================================================================
   CardPreview — 라이브 신용카드 시각화
   ======================================================================== */
function CardPreview({
  brand,
  number,
  holder,
  expiry,
}: {
  brand: string;
  number: string;
  holder: string;
  expiry: string;
}) {
  // brand별 그룹 표준 (Amex 4-6-5, 그 외 4-4-4-4)
  const groups = brand === 'amex' ? [4, 6, 5] : [4, 4, 4, 4];
  const digits = number.replace(/\D/g, '');
  let pos = 0;
  const masked = groups
    .map((len) => {
      const real = digits.slice(pos, pos + len);
      pos += len;
      return real + '•'.repeat(Math.max(0, len - real.length));
    })
    .join(' ');
  return (
    <div className={`ai-cardview ai-cardview--${brand || 'other'}`} aria-hidden>
      <div className="ai-cardview__top">
        <span className="ai-cardview__chip">
          <span className="ai-cardview__chipInner" />
        </span>
        <span className="ai-cardview__brand">{(brand || 'card').toUpperCase()}</span>
      </div>
      <div className="ai-cardview__number">{masked}</div>
      <div className="ai-cardview__bottom">
        <div className="ai-cardview__field">
          <span className="ai-cardview__fieldLabel">CARDHOLDER</span>
          <span className="ai-cardview__fieldValue">
            {holder || 'YOUR NAME'}
          </span>
        </div>
        <div className="ai-cardview__field ai-cardview__field--right">
          <span className="ai-cardview__fieldLabel">EXPIRES</span>
          <span className="ai-cardview__fieldValue">{expiry || 'MM/YY'}</span>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================
   WifiFormView — WiFi (라이브 QR + 폼)
   ======================================================================== */
interface WifiFormViewProps {
  name: string; setName: (v: string) => void;
  ssid: string; setSsid: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  wifiSecurity: WifiSecurity; setWifiSecurity: (v: WifiSecurity) => void;
  wifiHidden: boolean; setWifiHidden: (v: boolean) => void;
  category: CategorySlug; setCategory: (v: CategorySlug) => void;
  notes: string; setNotes: (v: string) => void;
  showExtras: boolean; setShowExtras: (v: boolean | ((p: boolean) => boolean)) => void;
}

function WifiFormView(p: WifiFormViewProps) {
  const extrasFilled = [p.notes].filter((v) => v.trim()).length;

  // SSID와 name 자동 동기화 — name이 비어있으면 ssid를 따라감
  function handleSsidChange(v: string) {
    p.setSsid(v);
    if (!p.name || p.name === p.ssid) {
      p.setName(v);
    }
  }

  // WiFi QR 표준 문자열
  const qrPayload = useMemo(() => {
    if (!p.ssid) return null;
    const t = p.wifiSecurity === 'open' ? 'nopass' :
              p.wifiSecurity === 'WEP' ? 'WEP' : 'WPA';
    const escapedSsid = escapeWifiQR(p.ssid);
    const escapedPw = escapeWifiQR(p.password);
    const hiddenPart = p.wifiHidden ? 'H:true;' : '';
    return `WIFI:T:${t};S:${escapedSsid};P:${escapedPw};${hiddenPart};`;
  }, [p.ssid, p.password, p.wifiSecurity, p.wifiHidden]);

  return (
    <>
      {/* 라이브 QR 미리보기 */}
      <WifiQRPreview payload={qrPayload} ssid={p.ssid} security={p.wifiSecurity} />

      <section className="ai-sec">
        <SectionLabel num="01" title="네트워크 정보" />
        <div className="ai-sec__body">
          <FormField
            id="ai-wifi-ssid"
            label="SSID (네트워크 이름)"
            placeholder="예: home_5G"
            value={p.ssid}
            onChange={(e) => handleSsidChange(e.target.value)}
            autoFocus
            copyable
          />

          {/* 보안 종류 — select 드롭다운 (대부분 WPA2 default라 칩 노출 가치 ↓) */}
          <div className="ai-field">
            <label className="ai-field__label">보안</label>
            <div className="ai-field__selectWrap">
              <select
                className="ai-field__select"
                value={p.wifiSecurity}
                onChange={(e) => p.setWifiSecurity(e.target.value as WifiSecurity)}
                aria-label="보안 종류"
              >
                {WIFI_SECURITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronIcon className="ai-field__selectChevron" />
            </div>
          </div>

          {p.wifiSecurity !== 'open' && (
            <FormField
              id="ai-wifi-password"
              type="password"
              label="비밀번호"
              placeholder="••••••••"
              value={p.password}
              onChange={(e) => p.setPassword(e.target.value)}
              copyable
            />
          )}

          <label className="ai-checkRow">
            <input
              type="checkbox"
              checked={p.wifiHidden}
              onChange={(e) => p.setWifiHidden(e.target.checked)}
            />
            <span>숨김 SSID (broadcast하지 않는 네트워크)</span>
          </label>
        </div>
      </section>

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
              <span className="ai-sec__metaList">카테고리 · 메모</span>
            )}
          </span>
          <ChevronIcon className="ai-sec__chevron" />
        </button>

        {p.showExtras && (
          <div className="ai-sec__body ai-sec__body--extras">
            <CategorySelect value={p.category} onChange={p.setCategory} />

            <NotesField
              value={p.notes}
              onChange={p.setNotes}
              placeholder="(선택) 라우터 위치, 게스트 네트워크 등"
            />
          </div>
        )}
      </section>
    </>
  );
}

function escapeWifiQR(s: string): string {
  // WiFi QR 표준에서 \ ; , : " 는 escape 필요
  return s.replace(/([\\;,:"])/g, '\\$1');
}

function WifiQRPreview({
  payload,
  ssid,
  security,
}: {
  payload: string | null;
  ssid: string;
  security: WifiSecurity;
}) {
  return (
    <div className="ai-wifi-qr">
      <div className="ai-wifi-qr__frame">
        {payload ? (
          <QRCode
            value={payload}
            size={144}
            bgColor="#FFFFFF"
            fgColor="#0A0E1A"
            level="M"
          />
        ) : (
          <div className="ai-wifi-qr__placeholder">
            <WifiBigIcon />
            <span>SSID 입력 시 QR 자동 생성</span>
          </div>
        )}
      </div>
      <div className="ai-wifi-qr__info">
        <span className="ai-wifi-qr__eyebrow">SHARE — INSTANT</span>
        <p className="ai-wifi-qr__desc">
          {ssid ? (
            <>
              <strong className="ai-wifi-qr__ssid">{ssid}</strong>
              {' · '}{security === 'open' ? '암호 없음' : security}
              <br />
              스마트폰 카메라로 스캔하면 즉시 연결됩니다.
            </>
          ) : (
            <>
              SSID와 비밀번호를 입력하면<br />
              QR 코드가 즉시 생성돼 공유할 수 있어요.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ========================================================================
   ApiKeyFormView — API Key (환경 배지 + 폼)
   ======================================================================== */
interface ApiKeyFormViewProps {
  name: string; setName: (v: string) => void;
  apiKeyId: string; setApiKeyId: (v: string) => void;
  apiKeySecret: string; setApiKeySecret: (v: string) => void;
  apiEnvironment: ApiEnvironment; setApiEnvironment: (v: ApiEnvironment) => void;
  apiExpiresAt: string; setApiExpiresAt: (v: string) => void;
  url: string; setUrl: (v: string) => void;
  category: CategorySlug; setCategory: (v: CategorySlug) => void;
  notes: string; setNotes: (v: string) => void;
  showExtras: boolean; setShowExtras: (v: boolean | ((p: boolean) => boolean)) => void;
}

function ApiKeyFormView(p: ApiKeyFormViewProps) {
  const extrasFilled = [p.apiKeyId, p.url, p.notes, p.apiExpiresAt].filter((v) => v.trim()).length;

  // 만료일 임박 경고 — 30일 이내
  const expiryWarning = useMemo(() => {
    if (!p.apiExpiresAt) return null;
    const now = new Date();
    const exp = new Date(p.apiExpiresAt);
    if (Number.isNaN(exp.getTime())) return null;
    const diffMs = exp.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days < 0) return { tone: 'danger', text: `${Math.abs(days)}일 전 만료` };
    if (days === 0) return { tone: 'danger', text: '오늘 만료' };
    if (days <= 7)  return { tone: 'danger', text: `${days}일 남음` };
    if (days <= 30) return { tone: 'warning', text: `${days}일 남음` };
    return null;
  }, [p.apiExpiresAt]);

  const envMeta = API_ENVS.find((e) => e.value === p.apiEnvironment) || API_ENVS[0];

  return (
    <>
      {/* 환경 배지 hero */}
      <div className={`ai-env ai-env--${envMeta.tone}`}>
        <span className="ai-env__rail" aria-hidden />
        <div className="ai-env__main">
          <span className="ai-env__eyebrow">API ENVIRONMENT</span>
          <span className="ai-env__badge">{envMeta.full}</span>
        </div>
        {p.apiEnvironment === 'production' && (
          <span className="ai-env__warn" title="프로덕션 시크릿 — 신중히 다루세요">
            <AlertIcon />
          </span>
        )}
      </div>

      <section className="ai-sec">
        <SectionLabel num="01" title="키 정보" />
        <div className="ai-sec__body">
          <FormField
            id="ai-api-name"
            label="이름 / 별칭"
            placeholder="예: OpenAI Production, AWS root"
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            autoFocus
          />

          {/* 환경 칩 — 색상 코딩 */}
          <div className="ai-field">
            <label className="ai-field__label">환경</label>
            <div className="ai-chips ai-chips--env" role="radiogroup" aria-label="환경">
              {API_ENVS.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  role="radio"
                  aria-checked={p.apiEnvironment === e.value}
                  className={
                    'ai-chip ai-chip--env'
                    + ` ai-chip--${e.tone}`
                    + (p.apiEnvironment === e.value ? ' is-on' : '')
                  }
                  onClick={() => p.setApiEnvironment(e.value)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <FormField
            id="ai-api-secret"
            type="password"
            label="Secret"
            placeholder="sk-..."
            value={p.apiKeySecret}
            onChange={(e) => p.setApiKeySecret(e.target.value)}
            copyable
            hint="가장 중요한 필드 · 절대 노출되면 안 됨"
          />
        </div>
      </section>

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
              <span className="ai-sec__metaList">Key ID · URL · 만료일 · 메모</span>
            )}
          </span>
          <ChevronIcon className="ai-sec__chevron" />
        </button>

        {p.showExtras && (
          <div className="ai-sec__body ai-sec__body--extras">
            <FormField
              id="ai-api-keyid"
              label="Key ID (선택)"
              placeholder="예: AKIA... 또는 access key id"
              value={p.apiKeyId}
              onChange={(e) => p.setApiKeyId(e.target.value)}
              copyable
            />

            <FormField
              id="ai-api-url"
              type="url"
              label="API URL (선택)"
              placeholder="https://api.example.com"
              value={p.url}
              onChange={(e) => p.setUrl(e.target.value)}
            />

            <div className="ai-field">
              <div className="ai-note__contentLabel">
                <label className="ai-field__label" htmlFor="ai-api-expires">만료일 (선택)</label>
                {expiryWarning && (
                  <span className={`ai-expiry-warn ai-expiry-warn--${expiryWarning.tone}`}>
                    {expiryWarning.text}
                  </span>
                )}
              </div>
              <input
                id="ai-api-expires"
                type="date"
                className="ai-field__date"
                value={p.apiExpiresAt}
                onChange={(e) => p.setApiExpiresAt(e.target.value)}
              />
            </div>

            <CategorySelect value={p.category} onChange={p.setCategory} />

            <NotesField
              value={p.notes}
              onChange={p.setNotes}
              placeholder="(선택) scope, 권한, 발급처 등"
            />
          </div>
        )}
      </section>
    </>
  );
}

/* ========================================================================
   재사용 헬퍼 — CategorySelect / NotesField / SectionLabel
   ======================================================================== */
function CategorySelect({
  value,
  onChange,
  disabled = false,
  lockHint = false,
}: {
  value: CategorySlug;
  onChange: (v: CategorySlug) => void;
  disabled?: boolean;
  lockHint?: boolean;
}) {
  return (
    <div className="ai-field">
      <label className="ai-field__label">
        카테고리
        {lockHint && (
          <span className="ai-field__lockHint">카탈로그 지정 · 수정 불가</span>
        )}
      </label>
      <div className="ai-field__selectWrap">
        <select
          className="ai-field__select"
          value={value}
          onChange={(e) => onChange(e.target.value as CategorySlug)}
          disabled={disabled}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <ChevronIcon className="ai-field__selectChevron" />
      </div>
    </div>
  );
}

function NotesField({
  value,
  onChange,
  placeholder = '(선택) 추가 메모',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="ai-field">
      <label className="ai-field__label">메모</label>
      <textarea
        className="ai-field__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
      />
    </div>
  );
}

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
   카드번호 포맷팅 헬퍼 — 카드사별 표준 띄어쓰기
   - Visa/Mastercard/JCB/Discover: 4-4-4-4 (16자리, Visa는 13~19까지 가변)
   - Amex: 4-6-5 (15자리)
   - Diners Club ('other'에서 일부 — 14자리): 4-6-4
   ======================================================================== */
function formatCardNumber(raw: string, brand: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, brand === 'amex' ? 15 : 19);
  if (!digits) return '';

  if (brand === 'amex') {
    // 4-6-5
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 10);
    const c = digits.slice(10, 15);
    return [a, b, c].filter(Boolean).join(' ');
  }

  // 기본: 4-4-4-4 (... 추가 자리 있으면 더 그룹)
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function cardBrandHint(brand: string): string {
  switch (brand) {
    case 'amex':       return '15자리 · 4-6-5';
    case 'diners':     return '14자리 · 4-6-4';
    case 'visa':
    case 'mastercard':
    case 'jcb':
    case 'discover':   return '16자리 · 4-4-4-4';
    default:           return '13~19자리';
  }
}

function cardNumberPlaceholder(brand: string): string {
  if (brand === 'amex') return '1234 567890 12345';
  return '1234 5678 9012 3456';
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

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function WifiBigIcon() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 30a28 28 0 0 1 40 0" />
      <path d="M20 38a18 18 0 0 1 24 0" />
      <path d="M28 46a8 8 0 0 1 8 0" />
      <circle cx="32" cy="52" r="2" fill="currentColor" />
    </svg>
  );
}
