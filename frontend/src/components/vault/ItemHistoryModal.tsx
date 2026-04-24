import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import Modal from '../Modal';
import { vaultApi } from '../../api/vault';
import { base64ToBytes } from '../../crypto/base64';
import { decryptJson } from '../../crypto/cipher';
import { useSessionStore } from '../../store/session';
import type { DecryptedVaultItem, VaultItemPlaintext } from '../../types/vault';

import './ItemHistoryModal.css';

interface ItemHistoryModalProps {
  item: DecryptedVaultItem | null;
  onClose: () => void;
}

interface DecryptedHistoryEntry {
  id: string;
  changedAt: string;
  plaintext: VaultItemPlaintext;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < min) return '방금 전';
  if (diff < hour) return `${Math.floor(diff / min)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function ItemHistoryModal({ item, onClose }: ItemHistoryModalProps) {
  const dek = useSessionStore((s) => s.dek);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(false);

  // 모달 닫힐 때 상태 리셋
  useEffect(() => {
    if (!item) {
      setRevealed(new Set());
      setRevealAll(false);
    }
  }, [item]);

  const { data: rawHistory, isPending } = useQuery({
    queryKey: ['vault-item-history', item?.id],
    queryFn: () => vaultApi.history(item!.id),
    enabled: !!item,
  });

  const { data: decryptedHistory } = useQuery({
    queryKey: ['vault-item-history-decrypted', item?.id, rawHistory?.history.length],
    queryFn: async (): Promise<DecryptedHistoryEntry[]> => {
      if (!rawHistory || !dek) return [];
      const out = await Promise.all(
        rawHistory.history.map(async (h) => {
          try {
            const plaintext = await decryptJson<VaultItemPlaintext>(
              dek,
              base64ToBytes(h.encryptedData),
              base64ToBytes(h.encryptedIv),
            );
            return {
              id: h.id,
              changedAt: h.changedAt,
              plaintext,
            };
          } catch {
            return null;
          }
        }),
      );
      return out.filter((x): x is DecryptedHistoryEntry => x !== null);
    },
    enabled: !!rawHistory && !!dek,
  });

  if (!item) return null;

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isPasswordVisible = (id: string) => revealAll || revealed.has(id);

  return (
    <Modal isOpen={!!item} onClose={onClose} title={`${item.plaintext.name} · 변경 이력`}>
      <div className="ihm">
        <header className="ihm__head">
          <h2 className="serif-display ihm__title">변경 이력</h2>
          <p className="ihm__subtitle">
            <strong className="ihm__inlineName">{item.plaintext.name}</strong>의 이전 비밀번호 기록입니다.
          </p>
        </header>

        <div className="ihm__toolbar">
          <span className="ihm__currentChip">
            <span className="ihm__currentDot" aria-hidden />
            현재 버전 · {relativeTime(item.updatedAt)}
          </span>
          {decryptedHistory && decryptedHistory.length > 0 && (
            <button
              type="button"
              className={`ihm__revealAllBtn${revealAll ? ' is-on' : ''}`}
              onClick={() => setRevealAll((v) => !v)}
            >
              {revealAll ? '모두 숨기기' : '모두 보기'}
            </button>
          )}
        </div>

        {isPending && (
          <p className="ihm__state">불러오는 중…</p>
        )}

        {!isPending && decryptedHistory && decryptedHistory.length === 0 && (
          <p className="ihm__state">아직 변경된 적이 없는 항목입니다.</p>
        )}

        <ul className="ihm__list">
          {decryptedHistory?.map((entry) => {
            const isVisible = isPasswordVisible(entry.id);
            return (
              <li key={entry.id} className="ihm__entry">
                <div className="ihm__entryHead">
                  <span className="ihm__time">{relativeTime(entry.changedAt)}</span>
                </div>

                <dl className="ihm__rows">
                  {entry.plaintext.username && (
                    <div className="ihm__row">
                      <span className="ihm__label">아이디</span>
                      <span className="ihm__value">{entry.plaintext.username}</span>
                    </div>
                  )}
                  <div className="ihm__row">
                    <span className="ihm__label">비밀번호</span>
                    <span className="ihm__value is-mono">
                      {isVisible ? entry.plaintext.password : '••••••••••••'}
                    </span>
                    {!revealAll && (
                      <button
                        type="button"
                        className="ihm__pillBtn"
                        onClick={() => toggleReveal(entry.id)}
                      >
                        {isVisible ? '숨기기' : '보기'}
                      </button>
                    )}
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
