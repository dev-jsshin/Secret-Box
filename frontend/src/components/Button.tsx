import { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

export default function Button({
  loading,
  loadingLabel = '처리 중…',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`sb-button${loading ? ' is-loading' : ''}`}
    >
      <span className="sb-button__label">
        {loading ? loadingLabel : children}
      </span>
      <span className="sb-button__arrow" aria-hidden>
        →
      </span>
    </button>
  );
}
