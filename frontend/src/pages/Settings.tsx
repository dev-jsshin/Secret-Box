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
import { ApiError, setAccessToken, setRefreshToken } from '../api/client';
import { base64ToBytes, bytesToBase64 } from '../crypto/base64';
import { encrypt } from '../crypto/cipher';
import { DEFAULT_KDF_PARAMS, deriveAuthHash, deriveKek, randomBytes } from '../crypto/kdf';
import { useSessionStore } from '../store/session';

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
  const setSession = useSessionStore((s) => s.setSession);
  const sessionUserId = useSessionStore((s) => s.userId);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldError, setOldError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(newPassword), [newPassword]);

  // DEK 없으면 로그인으로
  if (!dek || !email) {
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
      return usersApi.changePassword({
        oldAuthHash: bytesToBase64(oldAuthHash),
        newAuthHash: bytesToBase64(newAuthHash),
        newKdfSalt: bytesToBase64(newSalt),
        newKdfIterations: DEFAULT_KDF_PARAMS.iterations,
        newKdfMemoryKb: DEFAULT_KDF_PARAMS.memoryKb,
        newKdfParallelism: DEFAULT_KDF_PARAMS.parallelism,
        newProtectedDek: bytesToBase64(newProtected.ciphertext),
        newProtectedDekIv: bytesToBase64(newProtected.iv),
      });
    },
    onSuccess: (result) => {
      // 토큰 갱신 (모든 다른 세션은 폐기됨)
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      setSession({
        userId: sessionUserId ?? '',
        email: email ?? '',
        accessToken: result.accessToken,
        dek,
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(result.message);
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
    <div className="page">
      <main className="settings">
        <header className="settings__head rise delay-1">
          <Link to="/vault" className="settings__back">
            ← 보관함으로
          </Link>
          <Logo size={26} />
        </header>

        <section className="settings__intro rise delay-2">
          <h1 className="serif-display settings__title">설정</h1>
          <p className="settings__sub">계정과 보안 설정</p>
        </section>

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

        {/* 마스터 비밀번호 변경 */}
        <section className="settings__card rise delay-4">
          <h2 className="settings__cardTitle">마스터 비밀번호 변경</h2>
          <p className="settings__cardLede">
            저장된 항목은 <strong>재암호화되지 않습니다</strong>.
            새 비밀번호로 데이터 키만 다시 감쌉니다. 다른 기기는 모두 로그아웃됩니다.
          </p>

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

            <div className="settings__actions">
              <Button
                type="submit"
                loading={mutation.isPending}
                loadingLabel="암호화 처리 중…"
              >
                비밀번호 변경
              </Button>
            </div>
          </form>
        </section>
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
