import { FocusEvent, FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import Logo from '../components/Logo';
import Button from '../components/Button';
import FormField from '../components/FormField';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import AlertModal from '../components/AlertModal';
import { scorePassword } from '../lib/passwordTools';

import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { bytesToBase64 } from '../crypto/base64';
import { DEFAULT_KDF_PARAMS, deriveAuthHash, deriveKek, randomBytes } from '../crypto/kdf';
import { createAndProtectDek } from '../crypto/keys';

import './Register.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

interface RegisterPayload {
  email: string;
  password: string;
}

interface ErrorAlert {
  title: string;
  message?: string;
}

function mapApiErrorToAlert(error: unknown): ErrorAlert {
  if (error instanceof ApiError) {
    const titleByCode: Record<string, string> = {
      EMAIL_ALREADY_EXISTS: '이미 가입된 이메일입니다',
      VALIDATION_ERROR: '입력값을 확인해주세요',
      WEAK_KDF_PARAMS: '보안 파라미터가 부족합니다',
      INVALID_BASE64: '데이터 형식 오류',
    };
    return {
      title: titleByCode[error.code] ?? '가입에 실패했습니다',
      message: error.message,
    };
  }
  return {
    title: '서버에 연결할 수 없습니다',
    message: '네트워크 상태를 확인한 뒤 다시 시도해주세요.',
  };
}

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const strength = useMemo(() => scorePassword(password), [password]);

  const mutation = useMutation({
    mutationFn: async ({ email, password }: RegisterPayload) => {
      const salt = randomBytes(16);
      const params = { salt, ...DEFAULT_KDF_PARAMS };

      const kek = await deriveKek(password, params);
      const authHash = await deriveAuthHash(kek, password);
      const { protectedDek, protectedDekIv } = await createAndProtectDek(password, params);

      return authApi.register({
        email,
        authHash: bytesToBase64(authHash),
        kdfSalt: bytesToBase64(salt),
        kdfIterations: params.iterations,
        kdfMemoryKb: params.memoryKb,
        kdfParallelism: params.parallelism,
        protectedDek: bytesToBase64(protectedDek),
        protectedDekIv: bytesToBase64(protectedDekIv),
      });
    },
    onSuccess: () => {
      navigate('/login', { state: { justRegistered: true, email } });
    },
    onError: (error) => {
      setErrorAlert(mapApiErrorToAlert(error));
    },
  });

  function validate(): { ok: boolean; mismatch: boolean } {
    let ok = true;
    let mismatch = false;

    if (!email) {
      setEmailError('필수 항목입니다.');
      ok = false;
    } else if (!EMAIL_RE.test(email)) {
      setEmailError('올바른 이메일 형식이 아닙니다.');
      ok = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('필수 항목입니다.');
      ok = false;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      ok = false;
    } else {
      setPasswordError('');
    }

    if (!confirm) {
      setConfirmError('필수 항목입니다.');
      ok = false;
    } else if (confirm !== password) {
      setConfirmError('비밀번호가 일치하지 않습니다.');
      ok = false;
      mismatch = true;
    } else {
      setConfirmError('');
    }

    return { ok, mismatch };
  }

  function handleConfirmBlur(_e: FocusEvent<HTMLInputElement>) {
    if (password && confirm && confirm !== password) {
      setConfirmError('비밀번호가 일치하지 않습니다.');
      setErrorAlert({
        title: '비밀번호가 일치하지 않습니다',
        message: '마스터 비밀번호와 확인 필드의 값이 달라요.\n다시 입력해주세요.',
      });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) return;   // 버튼 disabled로 막혀있지만 안전장치

    const { ok, mismatch } = validate();
    if (mismatch) {
      setErrorAlert({
        title: '비밀번호가 일치하지 않습니다',
        message: '마스터 비밀번호와 확인 필드의 값이 달라요.',
      });
      return;
    }
    if (!ok) {
      setErrorAlert({
        title: '입력값을 확인해주세요',
        message: '빨간 줄로 표시된 필드를 다시 입력해주세요.',
      });
      return;
    }
    mutation.mutate({ email, password });
  }

  return (
    <div className="page page--auth">
      <main className="register">
        <section className="register__brand rise delay-1">
          <span className="register__halo" aria-hidden />
          <Logo size={42} pulsing={mutation.isPending} />
          <h1 className="serif-display register__title">
            <em>SecretBox</em>를 만듭니다
          </h1>
        </section>

        <div className="register__center">
        <form className="register__form" onSubmit={handleSubmit} noValidate>
          <div className="rise delay-2">
            <FormField
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              label="이메일"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
              hint="평문으로 저장되는 유일한 정보입니다."
            />
          </div>

          <div className="rise delay-3">
            <FormField
              id="password"
              type="password"
              autoComplete="new-password"
              label="마스터 비밀번호"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
              hint={<PasswordStrengthMeter score={strength.score} label={strength.label} />}
            />
          </div>

          <div className="rise delay-4">
            <FormField
              id="confirm"
              type="password"
              autoComplete="new-password"
              label="비밀번호 확인"
              placeholder="••••••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={handleConfirmBlur}
              error={confirmError}
              hint="오타 방지를 위해 한 번 더 입력하세요."
            />
          </div>

          <aside className="register__warn rise delay-5">
            <p className="register__warnText">
              마스터 비밀번호를 잊으면 모든 데이터를 영구적으로 잃습니다.<br />
              서버에 백업이 없어 복구할 수 없습니다.
            </p>
          </aside>

          <label className="register__terms rise delay-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span className="register__termsBox" aria-hidden />
            <span className="register__termsText">
              마스터 비밀번호 분실 시 데이터 복구가 불가능하다는 점에 동의합니다.
            </span>
          </label>

          <div className="rise delay-7">
            <Button
              type="submit"
              loading={mutation.isPending}
              loadingLabel="암호화 처리 중…"
              disabled={!agreed}
            >
              만들기
            </Button>
          </div>
        </form>

        <p className="register__altLink rise delay-7">
          이미 가입하셨나요?&nbsp;
          <Link to="/login" className="register__altAnchor">
            로그인 →
          </Link>
        </p>
        </div>

        <footer className="register__foot rise delay-7">
          <p className="register__system">
            ARGON2ID&nbsp;·&nbsp;HMAC-SHA256&nbsp;·&nbsp;AES-256-GCM&nbsp;·&nbsp;CLIENT-SIDE
          </p>
          <p className="register__credit">
            Crafted by{' '}
            {/* <span className="register__creditName">dev-jsshin</span>
            {' '}·{' '} */}
            <span className="register__creditName">신준섭</span>
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
