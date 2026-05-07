import { FormEvent, useState } from 'react';

interface Props {
  email: string;
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
}

export function TwoFactorScreen({ email, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(code.replace(/\s/g, ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : '2FA 코드가 맞지 않습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen lock">
      <div className="lock__brand">
        <div className="lock__logo">SB</div>
        <h1 className="lock__title">2단계 인증</h1>
        <p className="lock__lede">
          <strong style={{ color: 'var(--ink-primary)', fontWeight: 600 }}>{email}</strong> 계정의
          {' '}인증 앱 코드 또는 복구 코드를 입력하세요.
        </p>
      </div>

      <form className="lock__form" onSubmit={handle}>
        <div className="field">
          <label className="field__label" htmlFor="totp-code">Code</label>
          <input
            id="totp-code"
            className="field__input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {error && <p className="lock__error">{error}</p>}

        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={!code || busy}
        >
          {busy ? '확인 중…' : '확인'}
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={onCancel}
          disabled={busy}
        >
          취소
        </button>
      </form>
    </div>
  );
}
