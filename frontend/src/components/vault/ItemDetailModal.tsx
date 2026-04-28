import { useState } from 'react';

import Modal from '../Modal';
import Avatar from './Avatar';

import { CATEGORY_LABELS, type ServiceCatalogItem } from '../../api/catalog';
import type { DecryptedVaultItem } from '../../types/vault';

import './ItemDetailModal.css';

interface ItemDetailModalProps {
  item: DecryptedVaultItem | null;
  catalogMap: Map<string, ServiceCatalogItem>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShowHistory: () => void;
}

export default function ItemDetailModal({
  item,
  catalogMap,
  onClose,
  onEdit,
  onDelete,
  onShowHistory,
}: ItemDetailModalProps) {
  const [revealed, setRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!item) return null;

  const cat = item.plaintext.catalogSlug
    ? catalogMap.get(item.plaintext.catalogSlug)
    : undefined;

  const copy = async (field: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1400);
    } catch {
      // 클립보드 실패 — 무시 (보안 컨텍스트 외)
    }
  };

  const handleClose = () => {
    setRevealed(false);
    setCopiedField(null);
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <Modal isOpen={!!item} onClose={handleClose} title={item.plaintext.name}>
      <div className="idm">
        <header className="idm__head">
          <Avatar
            name={item.plaintext.name}
            iconUrl={cat?.iconUrl}
            brandColor={cat?.brandColor}
            size={48}
          />
          <div className="idm__headInfo">
            <h2 className="serif-display idm__name">{item.plaintext.name}</h2>
            <span className="idm__cat">{CATEGORY_LABELS[item.plaintext.category]}</span>
          </div>
        </header>

        <dl className="idm__rows">
          {item.plaintext.username && (
            <Row
              label="아이디"
              value={item.plaintext.username}
              copyKey="username"
              copiedKey={copiedField}
              onCopy={() => copy('username', item.plaintext.username!)}
            />
          )}

          <Row
            label="비밀번호"
            value={revealed ? (item.plaintext.password ?? '') : '••••••••••••'}
            copyKey="password"
            copiedKey={copiedField}
            onCopy={() => copy('password', item.plaintext.password ?? '')}
            mono
            extraButton={
              <button
                type="button"
                className={`idm__iconBtn${revealed ? ' is-on' : ''}`}
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
                aria-pressed={revealed}
                title={revealed ? '숨기기' : '보기'}
              >
                {revealed ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />

          {item.plaintext.url && (
            <Row
              label="URL"
              value={item.plaintext.url}
              copyKey="url"
              copiedKey={copiedField}
              onCopy={() => copy('url', item.plaintext.url!)}
              extraButton={
                <a
                  href={item.plaintext.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="idm__pillBtn"
                >
                  열기 ↗
                </a>
              }
            />
          )}

          {item.plaintext.notes && (
            <div className="idm__notesRow">
              <span className="idm__label">메모</span>
              <textarea
                className="idm__notes"
                value={item.plaintext.notes}
                readOnly
                rows={Math.min(6, Math.max(2, item.plaintext.notes.split('\n').length))}
              />
            </div>
          )}
        </dl>

        <footer className="idm__actions">
          {confirmingDelete ? (
            <>
              <span className="idm__confirmText">정말 삭제할까요?</span>
              <button
                type="button"
                className="idm__btnGhost"
                onClick={() => setConfirmingDelete(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="idm__btnDanger"
                onClick={onDelete}
              >
                삭제
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="idm__btnGhost"
                onClick={onShowHistory}
              >
                변경 이력
              </button>
              <button
                type="button"
                className="idm__btnGhost"
                onClick={() => setConfirmingDelete(true)}
              >
                삭제
              </button>
              <button
                type="button"
                className="idm__btnPrimary"
                onClick={onEdit}
              >
                수정
              </button>
            </>
          )}
        </footer>
      </div>
    </Modal>
  );
}

interface RowProps {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: () => void;
  mono?: boolean;
  extraButton?: React.ReactNode;
}

function Row({ label, value, copyKey, copiedKey, onCopy, mono, extraButton }: RowProps) {
  const copied = copiedKey === copyKey;
  return (
    <div className="idm__row">
      <span className="idm__label">{label}</span>
      <div className="idm__valueWrap">
        <span className={`idm__value${mono ? ' is-mono' : ''}`}>{value}</span>
        <div className="idm__rowBtns">
          {extraButton}
          <button
            type="button"
            className={`idm__pillBtn${copied ? ' is-copied' : ''}`}
            onClick={onCopy}
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none"
         stroke="currentColor" strokeWidth="1.3"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 9 C 3 5, 5.5 3.5, 9 3.5 S 15 5, 17 9 C 15 13, 12.5 14.5, 9 14.5 S 3 13, 1 9 Z" />
      <circle cx="9" cy="9" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none"
         stroke="currentColor" strokeWidth="1.3"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 9 C 3 5, 5.5 3.5, 9 3.5 S 15 5, 17 9 C 15 13, 12.5 14.5, 9 14.5 S 3 13, 1 9 Z" />
      <circle cx="9" cy="9" r="2.5" />
      <line x1="2.6" y1="15.4" x2="15.4" y2="2.6" />
    </svg>
  );
}
