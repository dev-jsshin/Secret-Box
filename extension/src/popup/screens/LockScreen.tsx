import { FormEvent, useState } from 'react';

interface Props {
  hostHint: string; // backend URL을 짧게 보여줌
  onUnlock: (password: string) => Promise<void> | void;
  onOpenSettings: () => void;
}

export function LockScreen({ hostHint, onUnlock, onOpenSettings }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '잠금 해제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen lock">
      <div className="lock__brand">
        <div className="lock__logo">SB</div>
        <h1 className="lock__title">SecretBox</h1>
        <p className="lock__lede">
          마스터 비밀번호로 잠금을 해제하면 현재 페이지에 자동완성을 띄워줍니다.
        </p>
      </div>

      <form className="lock__form" onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="lock-pwd">Master password</label>
          <input
            id="lock-pwd"
            className="field__input"
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="lock__error">{error}</p>}

        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={!password || busy}
        >
          {busy ? '잠금 해제 중…' : '잠금 해제'}
        </button>
      </form>

      <div className="lock__foot">
        <span>v0.0.1</span>
        <button type="button" className="lock__hostBtn" onClick={onOpenSettings}>
          {hostHint || '백엔드 설정 →'}
        </button>
      </div>
    </div>
  );
}
