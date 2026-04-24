import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import Logo from '../components/Logo';
import Button from '../components/Button';
import FormField from '../components/FormField';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import AlertModal from '../components/AlertModal';
import { scorePassword } from '../lib/passwordTools';

import { authApi } from '../api/auth';
import { usersApi } from '../api/users';
import { ApiError, getRefreshToken, setAccessToken, setRefreshToken } from '../api/client';
import { base64ToBytes, bytesToBase64 } from '../crypto/base64';
import { encrypt } from '../crypto/cipher';
import { DEFAULT_KDF_PARAMS, deriveAuthHash, deriveKek, randomBytes } from '../crypto/kdf';
import { useSessionStore } from '../store/session';
import { LOCK_OPTIONS, useLockSettings } from '../store/lockSettings';

import './Settings.css';

const MIN_PASSWORD_LENGTH = 10;

interface ErrorAlert {
  title: string;
  message?: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const dek = useSessionStore((s) => s.dek);
  const email = useSessionStore((s) => s.email);
  const unlockMaterial = useSessionStore((s) => s.unlockMaterial);
  const setSession = useSessionStore((s) => s.setSession);
  const clear = useSessionStore((s) => s.clear);
  const sessionUserId = useSessionStore((s) => s.userId);

  const lock = useSessionStore((s) => s.lock);
  const lockTimeoutMs = useLockSettings((s) => s.timeoutMs);
  const setLockTimeoutMs = useLockSettings((s) => s.setTimeoutMs);

  async function handleLogout() {
    const rt = getRefreshToken();
    if (rt) {
      try { await authApi.logout(rt); } catch { /* 서버 폐기 실패해도 로컬은 정리 */ }
    }
    clear();
    setAccessToken(null);
    setRefreshToken(null);
    navigate('/login', { replace: true });
  }

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldError, setOldError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(newPassword), [newPassword]);

  // DEK도 unlockMaterial도 없으면 완전 로그아웃 상태 → 로그인으로
  // (잠금 상태일 땐 LockScreen이 위에 떠 있으므로 페이지 자체는 유지)
  if (!email || (!dek && !unlockMaterial)) {
    navigate('/login', { replace: true });
    return null;
  }

  function validate(): boolean {
    let ok = true;
    if (!oldPassword) {
      setOldError('필수 항목입니다.');
      ok = false;
    } else {
      setOldError('');
    }
    if (!newPassword) {
      setNewError('필수 항목입니다.');
      ok = false;
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setNewError(`최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      ok = false;
    } else if (newPassword === oldPassword) {
      setNewError('현재 비밀번호와 같습니다.');
      ok = false;
    } else {
      setNewError('');
    }
    if (!confirmPassword) {
      setConfirmError('필수 항목입니다.');
      ok = false;
    } else if (confirmPassword !== newPassword) {
      setConfirmError('비밀번호가 일치하지 않습니다.');
      ok = false;
    } else {
      setConfirmError('');
    }
    return ok;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dek || !email) throw new Error('NO_SESSION');

      // 1) 현재 KDF 파라미터 받기 (서버 진실)
      const oldParams = await authApi.preLogin(email);

      // 2) 현재 비밀번호로 oldAuthHash 파생
      const oldKek = await deriveKek(oldPassword, {
        salt: base64ToBytes(oldParams.kdfSalt),
        iterations: oldParams.kdfIterations,
        memoryKb: oldParams.kdfMemoryKb,
        parallelism: oldParams.kdfParallelism,
      });
      const oldAuthHash = await deriveAuthHash(oldKek, oldPassword);

      // 3) 새 salt + 새 KEK 파생
      const newSalt = randomBytes(16);
      const newKek = await deriveKek(newPassword, { salt: newSalt, ...DEFAULT_KDF_PARAMS });
      const newAuthHash = await deriveAuthHash(newKek, newPassword);

      // 4) 기존 DEK를 새 KEK로 다시 감싸기 — 항목들 재암호화 X
      const newProtected = await encrypt(newKek, dek);

      // 5) 서버 호출
      const apiResult = await usersApi.changePassword({
        oldAuthHash: bytesToBase64(oldAuthHash),
        newAuthHash: bytesToBase64(newAuthHash),
        newKdfSalt: bytesToBase64(newSalt),
        newKdfIterations: DEFAULT_KDF_PARAMS.iterations,
        newKdfMemoryKb: DEFAULT_KDF_PARAMS.memoryKb,
        newKdfParallelism: DEFAULT_KDF_PARAMS.parallelism,
        newProtectedDek: bytesToBase64(newProtected.ciphertext),
        newProtectedDekIv: bytesToBase64(newProtected.iv),
      });
      return {
        apiResult,
        newProtected,
        newSalt,
      };
    },
    onSuccess: ({ apiResult, newProtected, newSalt }) => {
      // 토큰 갱신 (모든 다른 세션은 폐기됨)
      setAccessToken(apiResult.accessToken);
      setRefreshToken(apiResult.refreshToken);
      setSession({
        userId: sessionUserId ?? '',
        email: email ?? '',
        accessToken: apiResult.accessToken,
        dek: dek!,
        unlock: {
          protectedDek: newProtected.ciphertext,
          protectedDekIv: newProtected.iv,
          kdfSalt: newSalt,
          kdfParams: { ...DEFAULT_KDF_PARAMS },
        },
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(apiResult.message);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVALID_OLD_PASSWORD') {
        setOldError('현재 비밀번호가 올바르지 않습니다.');
        setErrorAlert({ title: '비밀번호 확인 실패', message: error.message });
      } else {
        const msg = error instanceof ApiError ? error.message : '변경에 실패했습니다.';
        setErrorAlert({ title: '오류', message: msg });
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSuccess(null);
    mutation.mutate();
  }

  return (
    <div className="page page--vault">
      <main className="settings">
        <header className="settings__head">
          <div className="settings__topStrip rise delay-1">
            <div className="settings__brand">
              <Logo size={28} />
              <span className="settings__wordmark">SecretBox</span>
            </div>
            <div className="settings__user">
              <span className="settings__email">{email}</span>
              <Link to="/vault" className="settings__userBtn settings__userBtn--primary">
                <BackArrowIcon />
                보관함
              </Link>
              <button type="button" className="settings__userBtn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>

          <section className="settings__intro rise delay-2">
            <h1 className="settings__title">설정</h1>
            <p className="settings__sub">계정과 보관함 비밀번호</p>
          </section>
        </header>

        <section className="settings__content">
        {/* 계정 정보 */}
        <section className="settings__card rise delay-3">
          <h2 className="settings__cardTitle">계정</h2>
          <dl className="settings__rows">
            <div className="settings__row">
              <span className="settings__rowLabel">이메일</span>
              <span className="settings__rowValue">{email}</span>
            </div>
          </dl>
        </section>

        {/* 자동 잠금 */}
        <section className="settings__card rise delay-4">
          <h2 className="settings__cardTitle">자동 잠금</h2>
          <div className="settings__notice">
            <ClockIcon />
            <span>일정 시간 활동이 없으면 보관함이 자동으로 잠깁니다. 다시 열려면 마스터 비밀번호만 입력하면 돼요.</span>
          </div>
          <div className="settings__lockOptions">
            {LOCK_OPTIONS.map((opt) => {
              const isActive = lockTimeoutMs === opt.ms;
              return (
                <button
                  key={opt.label}
                  type="button"
                  className={'settings__lockOpt' + (isActive ? ' is-active' : '')}
                  onClick={() => setLockTimeoutMs(opt.ms)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="settings__lockNow"
            onClick={() => lock()}
          >
            <LockIcon />
            <span>지금 잠그기</span>
          </button>
        </section>

        {/* 보관함 비밀번호 변경 */}
        <section className="settings__card rise delay-5">
          <h2 className="settings__cardTitle">보관함 비밀번호 변경</h2>

          <div className="settings__notice">
            <LockIcon />
            <span>비밀번호를 바꿔도 저장된 암호는 그대로 사용할 수 있어요.</span>
          </div>

          {success && (
            <p className="settings__successBox">
              <span className="settings__successDot" aria-hidden />
              {success}
            </p>
          )}

          <form className="settings__form" onSubmit={handleSubmit} noValidate>
            <FormField
              id="set-old"
              type="password"
              autoComplete="current-password"
              label="현재 비밀번호 *"
              placeholder="••••••••"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              error={oldError}
            />

            <FormField
              id="set-new"
              type="password"
              autoComplete="new-password"
              label="새 비밀번호 *"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={newError}
              hint={<PasswordStrengthMeter score={strength.score} label={strength.label} />}
            />

            <FormField
              id="set-confirm"
              type="password"
              autoComplete="new-password"
              label="새 비밀번호 확인 *"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmError}
            />

            <div className="settings__noticeWarn">
              <AlertIcon />
              <span>다른 기기에 로그인되어 있다면 모두 로그아웃됩니다.</span>
            </div>

            <div className="settings__actions">
              <Button
                type="submit"
                loading={mutation.isPending}
                loadingLabel="처리 중…"
              >
                비밀번호 변경
              </Button>
            </div>
          </form>
        </section>
        </section>

        <footer className="settings__foot">
          <p className="settings__system">
            ARGON2ID&nbsp;·&nbsp;HMAC-SHA256&nbsp;·&nbsp;AES-256-GCM&nbsp;·&nbsp;CLIENT-SIDE
          </p>
          <p className="settings__credit">
            Crafted by{' '}
            <span className="settings__creditName">dev-jsshin</span>
            {' '}·{' '}
            <span className="settings__creditName">신준섭</span>
          </p>
        </footer>
      </main>

      <AlertModal
        isOpen={!!errorAlert}
        onClose={() => setErrorAlert(null)}
        variant="error"
        title={errorAlert?.title ?? ''}
        message={errorAlert?.message}
      />
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
