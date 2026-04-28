import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import Logo from '../components/Logo';
import Button from '../components/Button';
import FormField from '../components/FormField';
import Modal from '../components/Modal';
import SecurityExplainer from '../components/SecurityExplainer';
import AlertModal from '../components/AlertModal';

import { authApi, type LoginResponse } from '../api/auth';
import { ApiError, setAccessToken, setRefreshToken } from '../api/client';
import { base64ToBytes, bytesToBase64 } from '../crypto/base64';
import { decrypt } from '../crypto/cipher';
import { deriveAuthHash, deriveKek } from '../crypto/kdf';
import { useSessionStore } from '../store/session';

import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = 'secretbox.rememberedEmail';

interface LoginPayload {
  email: string;
  password: string;
}

interface ErrorAlert {
  title: string;
  message?: string;
}

interface LocationState {
  justRegistered?: boolean;
  email?: string;
}

interface PendingTwoFactor {
  twoFactorToken: string;
  kek: Uint8Array;
  kdfSalt: Uint8Array;
  kdfParams: { iterations: number; memoryKb: number; parallelism: number };
  email: string;
}

function mapApiErrorToAlert(error: unknown): ErrorAlert {
  if (error instanceof ApiError) {
    const titleByCode: Record<string, string> = {
      INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다',
      VALIDATION_ERROR: '입력값을 확인해주세요',
      TOO_MANY_ATTEMPTS: '잠시 후 다시 시도해주세요',
      USER_NOT_FOUND: '이메일 또는 비밀번호가 올바르지 않습니다',
      ACCOUNT_LOCKED: '계정이 일시적으로 잠겼습니다',
      RATE_LIMITED: '요청이 너무 많습니다',
    };
    return {
      title: titleByCode[error.code] ?? '로그인에 실패했습니다',
      message: error.message,
    };
  }
  return {
    title: '서버에 연결할 수 없습니다',
    message: '네트워크 상태를 확인한 뒤 다시 시도해주세요.',
  };
}

function loadRemembered(): string | null {
  try {
    return localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const setSession = useSessionStore((s) => s.setSession);

  const remembered = loadRemembered();
  const initialEmail = state.email ?? remembered ?? '';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(!!remembered);
  const [showSecurity, setShowSecurity] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [errorAlert, setErrorAlert] = useState<ErrorAlert | null>(null);

  const [pending2fa, setPending2fa] = useState<PendingTwoFactor | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  // 체크박스/이메일 변경 시 localStorage 동기화
  useEffect(() => {
    try {
      if (rememberEmail && email && EMAIL_RE.test(email)) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else if (!rememberEmail) {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      // private mode 등에서 storage 접근 실패 → 무시
    }
  }, [rememberEmail, email]);

  /**
   * 1FA(비번만) 또는 2FA 통과 후 호출 — 응답에서 protectedDek 풀어 DEK 복구 + 세션 저장.
   */
  async function completeLogin(
    result: LoginResponse,
    kek: Uint8Array,
    kdfSalt: Uint8Array,
    derivedKdf: { iterations: number; memoryKb: number; parallelism: number },
  ) {
    if (
      !result.protectedDek || !result.protectedDekIv
      || !result.user || !result.accessToken || !result.refreshToken
    ) {
      throw new Error('서버 응답이 불완전합니다');
    }
    const protectedDek = base64ToBytes(result.protectedDek);
    const protectedDekIv = base64ToBytes(result.protectedDekIv);
    const dek = await decrypt(kek, protectedDek, protectedDekIv);

    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    setSession({
      userId: result.user.id,
      email: result.user.email,
      accessToken: result.accessToken,
      dek,
      unlock: {
        protectedDek,
        protectedDekIv,
        kdfSalt,
        kdfParams: derivedKdf,
      },
    });
    // recovery code로 통과한 경우 → 2FA가 비활성화됐으니 사용자에게 알리고 설정 페이지로
    if (result.recoveryUsed) {
      navigate('/settings?tab=security', {
        replace: true,
        state: { recoveryUsed: true },
      });
      return;
    }
    navigate('/vault');
  }

  const mutation = useMutation({
    mutationFn: async ({ email, password }: LoginPayload) => {
      const params = await authApi.preLogin(email);
      const kdfParams = {
        salt: base64ToBytes(params.kdfSalt),
        iterations: params.kdfIterations,
        memoryKb: params.kdfMemoryKb,
        parallelism: params.kdfParallelism,
      };
      const kek = await deriveKek(password, kdfParams);
      const authHash = await deriveAuthHash(kek, password);
      const result = await authApi.login(email, bytesToBase64(authHash));
      return { result, kek, kdfParams, email };
    },
    onSuccess: async ({ result, kek, kdfParams, email }) => {
      const derivedKdf = {
        iterations: kdfParams.iterations,
        memoryKb: kdfParams.memoryKb,
        parallelism: kdfParams.parallelism,
      };
      if (result.requires2fa && result.twoFactorToken) {
        // 2FA 단계로 — KEK은 메모리에 보관해뒀다가 코드 통과 후 protectedDek 풀 때 재사용
        setPending2fa({
          twoFactorToken: result.twoFactorToken,
          kek,
          kdfSalt: kdfParams.salt,
          kdfParams: derivedKdf,
          email,
        });
        setCode('');
        setCodeError('');
        return;
      }
      try {
        await completeLogin(result, kek, kdfParams.salt, derivedKdf);
      } catch (e) {
        setErrorAlert({
          title: '로그인 후처리 실패',
          message: e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.',
        });
      }
    },
    onError: (error) => {
      setErrorAlert(mapApiErrorToAlert(error));
    },
  });

  const twoFactorMutation = useMutation({
    mutationFn: async (codeInput: string) => {
      if (!pending2fa) throw new Error('NO_PENDING');
      const result = await authApi.loginTwoFactor(pending2fa.twoFactorToken, codeInput);
      return result;
    },
    onSuccess: async (result) => {
      if (!pending2fa) return;
      try {
        await completeLogin(result, pending2fa.kek, pending2fa.kdfSalt, pending2fa.kdfParams);
        setPending2fa(null);
      } catch (e) {
        setErrorAlert({
          title: '로그인 후처리 실패',
          message: e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.',
        });
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.code === 'INVALID_TOTP_CODE') {
          setCodeError('코드가 올바르지 않습니다');
          return;
        }
        if (error.code === 'INVALID_2FA_TOKEN') {
          setErrorAlert({
            title: '시간 초과',
            message: '인증 시간이 만료되었습니다. 처음부터 다시 로그인해주세요.',
          });
          setPending2fa(null);
          return;
        }
      }
      setErrorAlert(mapApiErrorToAlert(error));
    },
  });

  function validate(): boolean {
    let ok = true;
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
    } else {
      setPasswordError('');
    }
    return ok;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) {
      setErrorAlert({
        title: '입력값을 확인해주세요',
        message: '이메일과 비밀번호를 모두 입력해주세요.',
      });
      return;
    }
    mutation.mutate({ email, password });
  }

  function handleTwoFactorSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setCodeError('코드를 입력해주세요');
      return;
    }
    setCodeError('');
    twoFactorMutation.mutate(trimmed);
  }

  function handleCancel2fa() {
    setPending2fa(null);
    setCode('');
    setCodeError('');
    setPassword('');
  }

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
  }

  return (
    <div className="page page--auth">
      <main className="login">
        <section className="login__brand rise delay-1">
          <span className="login__halo" aria-hidden />
          <Logo size={42} pulsing={mutation.isPending} />
          <h1 className="serif-display login__title">
            <em>SecretBox</em>를 엽니다
          </h1>
          <p className="login__tagline">
            오직 당신만 아는 비밀번호 저장소
          </p>
        </section>

        <section className="login__intro rise delay-2">
          <p className="login__lede">
            마스터 비밀번호는 서버로 전송되지 않으며,<br />
            저장된 데이터는 오직 본인만 열람할 수 있습니다.
          </p>
          <button
            type="button"
            className="login__explainLink"
            onClick={() => setShowSecurity(true)}
          >
            <span className="login__explainIcon" aria-hidden>ⓘ</span>
            <span>어떻게 작동하나요?</span>
            <span className="login__explainArrow" aria-hidden>→</span>
          </button>
        </section>

        <div className="login__center">
        {state.justRegistered && !pending2fa && (
          <p className="login__welcome rise delay-2">
            <span className="login__welcomeDot" aria-hidden />
            가입이 완료되었습니다. 이제 들어와주세요.
          </p>
        )}

        {pending2fa && (
          <form className="login__form login__form--2fa" onSubmit={handleTwoFactorSubmit} noValidate>
            <div className="login__2faStep rise delay-2">
              <div className="login__2faStepIcon" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                     stroke="currentColor" strokeWidth="1.6"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                </svg>
              </div>
              <div className="login__2faStepBody">
                <div className="login__2faStepLabel">2단계 인증</div>
                <div className="login__2faStepText">
                  authenticator 앱의 <strong>6자리 코드</strong> 또는 발급받은
                  <strong> recovery code</strong>를 입력하세요.
                </div>
                <div className="login__2faStepHint">
                  {pending2fa.email}
                </div>
              </div>
            </div>

            <div className="rise delay-3">
              <FormField
                id="totp-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                label="6자리 코드 또는 복구 코드"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                error={codeError}
              />
            </div>

            <div className="rise delay-4">
              <Button
                type="submit"
                loading={twoFactorMutation.isPending}
                loadingLabel="확인 중…"
              >
                잠금 해제
              </Button>
            </div>

            <button
              type="button"
              className="login__cancel2fa rise delay-5"
              onClick={handleCancel2fa}
            >
              ← 다른 계정으로 로그인
            </button>
          </form>
        )}

        {!pending2fa && (
        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <div className="rise delay-3">
            <FormField
              id="email"
              type="email"
              autoComplete="email"
              autoFocus={!initialEmail}
              label="이메일"
              placeholder="you@example.com"
              value={email}
              onChange={handleEmailChange}
              error={emailError}
            />
          </div>

          <div className="rise delay-4">
            <FormField
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus={!!initialEmail}
              label="마스터 비밀번호"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
            />
          </div>

          <label className="login__remember rise delay-5">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
            />
            <span className="login__rememberBox" aria-hidden />
            <span className="login__rememberText">이메일 기억하기</span>
          </label>

          <div className="rise delay-6">
            <Button
              type="submit"
              loading={mutation.isPending}
              loadingLabel="잠금을 해제하는 중…"
            >
              열기
            </Button>
          </div>
        </form>
        )}

        {!pending2fa && (
        <p className="login__altLink rise delay-6">
          처음이신가요?&nbsp;
          <Link to="/register" className="login__altAnchor">
            회원가입 →
          </Link>
        </p>
        )}
        </div>

        <footer className="login__foot rise delay-6">
          <p className="login__system">
            ARGON2ID&nbsp;·&nbsp;HMAC-SHA256&nbsp;·&nbsp;AES-256-GCM&nbsp;·&nbsp;CLIENT-SIDE
          </p>
          <p className="login__credit">
            Crafted by{' '}
            {/* <span className="login__creditName">dev-jsshin</span>
            {' '}·{' '} */}
            <span className="login__creditName">신준섭</span>
          </p>
        </footer>
      </main>

      <Modal
        isOpen={showSecurity}
        onClose={() => setShowSecurity(false)}
        title="비밀번호가 서버에 닿지 않는 이유"
      >
        <SecurityExplainer />
      </Modal>

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
