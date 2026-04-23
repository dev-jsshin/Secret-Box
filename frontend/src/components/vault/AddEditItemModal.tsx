import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Modal from '../Modal';
import Button from '../Button';
import FormField from '../FormField';
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

import './AddEditItemModal.css';

interface AddEditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: DecryptedVaultItem | null;
  onError?: (msg: string) => void;
}

const CATEGORIES: CategorySlug[] = [
  'social', 'work', 'finance', 'shopping', 'media', 'dev', 'gaming', 'other',
];

type Step = 'pick' | 'form';

export default function AddEditItemModal({
  isOpen,
  onClose,
  initialItem,
  onError,
}: AddEditItemModalProps) {
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const isEdit = !!initialItem;

  const [step, setStep] = useState<Step>('pick');
  const [pickSearch, setPickSearch] = useState('');

  const [name, setName] = useState('');
  const [catalogSlug, setCatalogSlug] = useState<string | undefined>();
  const [category, setCategory] = useState<CategorySlug>('other');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

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
    if (initialItem) {
      const p = initialItem.plaintext;
      setName(p.name);
      setCatalogSlug(p.catalogSlug);
      setCategory(p.category);
      setUsername(p.username ?? '');
      setPassword(p.password);
      setUrl(p.url ?? '');
      setNotes(p.notes ?? '');
      setStep('form');
    } else {
      setName('');
      setCatalogSlug(undefined);
      setCategory('other');
      setUsername('');
      setPassword('');
      setUrl('');
      setNotes('');
      setStep('pick');
    }
  }, [isOpen, initialItem]);

  function handlePickService(item: ServiceCatalogItem) {
    setName(item.name);
    setCatalogSlug(item.slug);
    setCategory(item.category);
    if (item.defaultUrl) setUrl(item.defaultUrl);
    setStep('form');
  }

  function handlePickCustom() {
    setName('');
    setCatalogSlug(undefined);
    setCategory('other');
    setUrl('');
    setStep('form');
  }

  function generatePassword() {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const len = 20;
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < len; i++) out += charset[arr[i] % charset.length];
    setPassword(out);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dek) throw new Error('NO_DEK');
      const plaintext: VaultItemPlaintext = {
        name: name.trim(),
        catalogSlug,
        category,
        username: username.trim(),
        password,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
      };
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
      return vaultApi.create({ itemType: 'login', ...body });
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
      onError?.('이름을 입력해주세요.');
      return;
    }
    if (!username.trim()) {
      onError?.('아이디를 입력해주세요.');
      return;
    }
    if (!password) {
      onError?.('비밀번호를 입력해주세요.');
      return;
    }
    mutation.mutate();
  }

  // ---------- Title decision ----------
  const title =
    step === 'pick'
      ? '서비스 선택'
      : isEdit
      ? '항목 수정'
      : selectedFromCatalog
      ? `${selectedFromCatalog.name} 정보`
      : '새 항목 (직접 입력)';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {step === 'pick' && (
        <div className="ai-pick">
          <h2 className="serif-display ai-pick__title">
            어떤 <em>서비스</em>인가요?
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
          <header className="ai-form__pickedBanner">
            <Avatar
              name={name || '?'}
              iconUrl={selectedFromCatalog?.iconUrl}
              brandColor={selectedFromCatalog?.brandColor}
              size={36}
            />
            <div className="ai-form__pickedInfo">
              <span className="ai-form__pickedName">
                {name || (selectedFromCatalog ? selectedFromCatalog.name : '직접 입력')}
              </span>
              <span className="ai-form__pickedHint">
                {selectedFromCatalog
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
                aria-label="다른 서비스 선택"
                title="다른 서비스 선택"
              >
                ✕
              </button>
            )}
          </header>

          {!selectedFromCatalog && (
            <FormField
              id="ai-name"
              label="이름 *"
              placeholder="예: 회사 인트라넷"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

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
          />

          <div className="ai-form__pwRow">
            <div className="ai-form__pwField">
              <FormField
                id="ai-password"
                type="password"
                label="비밀번호 *"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="ai-form__genBtn"
              onClick={generatePassword}
              title="20자 랜덤 비밀번호 생성"
            >
              랜덤
            </button>
          </div>

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
              {isEdit ? '저장' : '추가'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
