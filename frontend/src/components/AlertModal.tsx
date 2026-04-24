import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './AlertModal.css';

export type AlertVariant = 'error' | 'warning' | 'info';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: AlertVariant;
  title: string;
  message?: string;
  actionLabel?: string;
  // confirm 모드: onConfirm 지정 시 [취소] [확인] 두 버튼이 렌더된다
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * 작은 안내/에러/확인 모달.
 * onConfirm이 있으면 confirm 모드 (취소+확인 두 버튼).
 * 그 외엔 단일 액션 모달 — ESC/Enter로 닫힘.
 */
export default function AlertModal({
  isOpen,
  onClose,
  variant = 'error',
  title,
  message,
  actionLabel = '확인',
  onConfirm,
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive = false,
}: AlertModalProps) {
  const isConfirm = !!onConfirm;

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (isConfirm) onConfirm!();
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, isConfirm, onClose, onConfirm]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`sb-alert sb-alert--${variant}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sb-alert-title"
    >
      <div className="sb-alert__backdrop" onClick={onClose} />
      <div className="sb-alert__card" role="document">
        <Sigil variant={variant} />
        <h2 id="sb-alert-title" className="sb-alert__title">
          {title}
        </h2>
        {message && <p className="sb-alert__message">{message}</p>}
        {isConfirm ? (
          <div className="sb-alert__actions">
            <button
              type="button"
              className="sb-alert__action sb-alert__action--ghost"
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={
                'sb-alert__action'
                + (destructive ? ' sb-alert__action--danger' : '')
              }
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="sb-alert__action"
            onClick={onClose}
            autoFocus
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Sigil({ variant }: { variant: AlertVariant }) {
  if (variant === 'error') {
    return (
      <svg
        className="sb-alert__sigil"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <rect
          x="9"
          y="9"
          width="14"
          height="14"
          transform="rotate(45 16 16)"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line x1="13" y1="13" x2="19" y2="19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="19" y1="13" x2="13" y2="19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === 'warning') {
    return (
      <svg
        className="sb-alert__sigil"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <polygon points="16,6 26,25 6,25" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        <line x1="16" y1="13" x2="16" y2="19.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <circle cx="16" cy="22" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  // info
  return (
    <svg
      className="sb-alert__sigil"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="1" />
      <circle cx="16" cy="11.5" r="0.9" fill="currentColor" />
      <line x1="16" y1="15" x2="16" y2="21" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
