import { InputHTMLAttributes, ReactNode, forwardRef, useState } from 'react';
import './FormField.css';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  index?: string;
  trailing?: ReactNode;
  copyable?: boolean;   // 입력 오른쪽에 복사 버튼 추가 (내부 아이콘 버튼 영역)
  hint?: ReactNode;
  error?: string;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, index, trailing, copyable, hint, error, type, ...inputProps },
  ref,
) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const effectiveType = isPassword && revealed ? 'text' : type;

  const value = typeof inputProps.value === 'string' ? inputProps.value : '';
  const showCopy = copyable && value.length > 0;
  const hasInnerButton = isPassword || showCopy;

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* noop */ }
  }

  return (
    <div className={`sb-field${error ? ' has-error' : ''}`}>
      <div className="sb-field__row">
        <label className="sb-field__label" htmlFor={inputProps.id}>
          {index && <span className="sb-field__index">{index}</span>}
          <span>{label}</span>
        </label>
        {trailing && <div className="sb-field__trailing">{trailing}</div>}
      </div>

      <div className="sb-field__inputWrap">
        <input
          ref={ref}
          className={`sb-field__input${hasInnerButton ? ' has-toggle' : ''}`}
          type={effectiveType}
          {...inputProps}
        />
        {(isPassword || showCopy) && (
          <div className="sb-field__actions">
            {showCopy && (
              <button
                type="button"
                className={`sb-field__innerBtn${copied ? ' is-on' : ''}`}
                onClick={handleCopy}
                tabIndex={-1}
                title={copied ? '복사됨' : '복사'}
                aria-label={copied ? '복사됨' : '복사'}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            )}
            {isPassword && (
              <button
                type="button"
                className={`sb-field__innerBtn${revealed ? ' is-on' : ''}`}
                onClick={() => setRevealed((v) => !v)}
                tabIndex={-1}
                title={revealed ? '숨기기' : '보기'}
                aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
                aria-pressed={revealed}
              >
                {revealed ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            )}
          </div>
        )}
        <span className="sb-field__rule" aria-hidden />
      </div>

      {(hint || error) && (
        <div className="sb-field__footer">
          {error ? (
            <span className="sb-field__error">{error}</span>
          ) : (
            <span className="sb-field__hint">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
});

function CopyIcon() {
  return (
    <svg viewBox="0 0 18 18" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.3"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
      <path d="M3 11.5V3.5A1 1 0 0 1 4 2.5h8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 18" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3.5 9.5 7.5 13.5 14.5 5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 18 18" width="17" height="17" fill="none"
         stroke="currentColor" strokeWidth="1.3"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 9 C 3 5, 5.5 3.5, 9 3.5 S 15 5, 17 9 C 15 13, 12.5 14.5, 9 14.5 S 3 13, 1 9 Z" />
      <circle cx="9" cy="9" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 18 18" width="17" height="17" fill="none"
         stroke="currentColor" strokeWidth="1.3"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 9 C 3 5, 5.5 3.5, 9 3.5 S 15 5, 17 9 C 15 13, 12.5 14.5, 9 14.5 S 3 13, 1 9 Z" />
      <circle cx="9" cy="9" r="2.5" />
      <line x1="2.6" y1="15.4" x2="15.4" y2="2.6" />
    </svg>
  );
}

export default FormField;
