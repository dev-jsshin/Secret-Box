import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import Modal from '../Modal';
import Button from '../Button';
import FormField from '../FormField';

import { vaultApi } from '../../api/vault';
import { ApiError } from '../../api/client';
import { bytesToBase64 } from '../../crypto/base64';
import { encryptJson } from '../../crypto/cipher';
import { useSessionStore } from '../../store/session';
import type { DecryptedVaultItem } from '../../types/vault';

import './QuickPasswordModal.css';

interface QuickPasswordModalProps {
  item: DecryptedVaultItem | null;
  onClose: () => void;
  onError?: (msg: string) => void;
}

/**
 * 비밀번호만 빠르게 변경하는 모달. 나머지 평문(name, username, url 등)은 그대로 유지.
 */
export default function QuickPasswordModal({ item, onClose, onError }: QuickPasswordModalProps) {
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);

  const [password, setPassword] = useState('');

  useEffect(() => {
    if (item) {
      setPassword(item.plaintext.password);
    } else {
      setPassword('');
    }
  }, [item]);

  function generate() {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const arr = new Uint8Array(20);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < 20; i++) out += charset[arr[i] % charset.length];
    setPassword(out);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dek || !item) throw new Error('NO_DEK');
      const updated = { ...item.plaintext, password };
      const { ciphertext, iv } = await encryptJson(dek, updated);
      return vaultApi.update(item.id, {
        encryptedData: bytesToBase64(ciphertext),
        encryptedIv: bytesToBase64(iv),
        expectedVersion: item.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      queryClient.invalidateQueries({ queryKey: ['vault-item-history', item?.id] });
      onClose();
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : '저장에 실패했습니다.';
      onError?.(msg);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      onError?.('비밀번호를 입력해주세요.');
      return;
    }
    if (password === item?.plaintext.password) {
      onClose();   // 변경 없음 → 그냥 닫기
      return;
    }
    mutation.mutate();
  }

  if (!item) return null;

  return (
    <Modal isOpen={!!item} onClose={onClose} title={`${item.plaintext.name} · 비밀번호 변경`}>
      <form className="qpm" onSubmit={handleSubmit} noValidate>
        <header className="qpm__head">
          <h2 className="serif-display qpm__title">
            비밀번호 <em>변경</em>
          </h2>
          <p className="qpm__subtitle">
            <strong className="qpm__inlineName">{item.plaintext.name}</strong>의 비밀번호만 새로 설정합니다.
          </p>
        </header>

        <FormField
          id="qpm-password"
          type="password"
          label="새 비밀번호 *"
          placeholder="••••••••"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          copyable
        />

        <div className="qpm__genRow">
          <button
            type="button"
            className="qpm__genBtn"
            onClick={generate}
          >
            랜덤 20자 생성
          </button>
        </div>

        <div className="qpm__actions">
          <button
            type="button"
            className="qpm__cancel"
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
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
