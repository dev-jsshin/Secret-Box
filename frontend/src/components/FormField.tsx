import { InputHTMLAttributes, ReactNode, forwardRef, useState } from 'react';
import './FormField.css';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  index?: string;
  trailing?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, index, trailing, hint, error, type, ...inputProps },
  ref,
) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const effectiveType = isPassword && revealed ? 'text' : type;

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
          className={`sb-field__input${isPassword ? ' has-toggle' : ''}`}
          type={effectiveType}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className={`sb-field__toggle${revealed ? ' is-on' : ''}`}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
            aria-pressed={revealed}
            tabIndex={-1}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
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
