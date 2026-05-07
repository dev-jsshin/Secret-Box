import { FormEvent, useState } from 'react';
import { normalizeBackendUrl, type SbSettings } from '../../shared/settings';

interface Props {
  settings: SbSettings;
  isLocked: boolean;             // 첫 실행(needs-config)에선 뒤로가기 X
  onSave: (next: SbSettings) => Promise<void>;
  onBack: () => void;
  onLockNow: () => void;
}

export function SettingsScreen({ settings, isLocked, onSave, onBack, onLockNow }: Props) {
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    try {
      await onSave({ ...settings, backendUrl: normalizeBackendUrl(backendUrl) });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar__brand">설정</div>
        {isLocked ? (
          <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
            FIRST RUN
          </span>
        ) : (
          <button className="iconBtn" type="button" title="닫기" onClick={onBack}>
            ✕
          </button>
        )}
      </div>

      <div className="settings">
        <form className="settings__section" onSubmit={submit}>
          <h2 className="settings__sectionTitle">백엔드 URL</h2>
          <p className="settings__sectionHint">
            본인 SecretBox 서버 주소. 예: <code>https://secretbox.lan</code>
            <br />
            <code>/api/v1</code>은 자동으로 붙입니다.
          </p>
          <div className="field" style={{ marginTop: 4 }}>
            <input
              className="field__input"
              type="url"
              inputMode="url"
              placeholder="https://your-host.lan"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
            {saved && (
              <span style={{ fontSize: 11.5, color: 'var(--success)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                SAVED
              </span>
            )}
          </div>
        </form>

        {!isLocked && (
          <div className="settings__section">
            <h2 className="settings__sectionTitle">세션</h2>
            <p className="settings__sectionHint">
              지금 잠그면 메모리의 KEK를 즉시 폐기합니다. 다시 사용하려면 마스터 비밀번호 필요.
            </p>
            <button
              className="btn btn--danger"
              type="button"
              onClick={() => { onLockNow(); onBack(); }}
            >
              즉시 잠금
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
