import { FormEvent, useState } from 'react';
import { AUTO_LOCK_OPTIONS, normalizeBackendUrl, type SbSettings } from '../../shared/settings';

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16, height: 16, marginTop: 2, accentColor: 'var(--amber)', cursor: 'pointer',
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-primary)', display: 'block', lineHeight: 1.4 }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: 'var(--ink-muted)', display: 'block', lineHeight: 1.5, marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

interface Props {
  settings: SbSettings;
  isLocked: boolean;             // 첫 실행(needs-config)에선 뒤로가기 X
  onSave: (next: SbSettings) => Promise<void>;
  onBack: () => void;
  onLockNow: () => void;
}

export function SettingsScreen({ settings, isLocked, onSave, onBack, onLockNow }: Props) {
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [totpAutofill, setTotpAutofill] = useState(settings.totpAutofill);
  const [totpAutoSubmit, setTotpAutoSubmit] = useState(settings.totpAutoSubmit);
  const [autoLockMinutes, setAutoLockMinutes] = useState(settings.autoLockMinutes);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    try {
      await onSave({
        ...settings,
        backendUrl: normalizeBackendUrl(backendUrl),
        totpAutofill,
        totpAutoSubmit,
        autoLockMinutes,
      });
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
          <h2 className="settings__sectionTitle" style={{ marginTop: 14 }}>자동 잠금</h2>
          <p className="settings__sectionHint">
            아무 활동 없이 N분 지나면 KEK을 폐기하고 잠금 화면으로. 자리 비울 때 vault 보호.
          </p>
          <div className="field" style={{ marginTop: 4 }}>
            <select
              className="field__input"
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
              style={{ cursor: 'pointer' }}
            >
              {AUTO_LOCK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <h2 className="settings__sectionTitle" style={{ marginTop: 14 }}>2FA 자동 입력</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <Toggle
              label="TOTP 자동 입력"
              hint="2FA 페이지 진입 시 직전에 사용한 항목의 OTP 코드를 자동으로 채움."
              checked={totpAutofill}
              onChange={setTotpAutofill}
            />
            <Toggle
              label="자동 입력 후 자동 submit"
              hint="OTP 입력 직후 폼 자동 제출. 잘못된 항목 매칭 시 즉시 잠기는 위험 있어 기본 OFF."
              checked={totpAutoSubmit}
              onChange={(v) => {
                setTotpAutoSubmit(v);
                if (v) setTotpAutofill(true); // submit하려면 autofill 필수
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
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
