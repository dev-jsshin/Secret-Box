import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import Logo from './Logo';
import Button from './Button';
import FormField from './FormField';

import { authApi } from '../api/auth';
import { getRefreshToken, setAccessToken, setRefreshToken } from '../api/client';
import { decrypt } from '../crypto/cipher';
import { deriveKek } from '../crypto/kdf';
import { useSessionStore } from '../store/session';

import './LockScreen.css';

/**
 * 보관함 잠금 해제 화면.
 *
 * - session.isLocked && session.unlockMaterial이 있을 때만 렌더된다.
 * - 사용자가 마스터 비번을 입력 → 로컬에서 KEK 재파생 → protectedDek 복호화 → DEK 복구.
 * - 서버 호출 없음. 비번이 틀리면 복호화 실패로 알린다.
 */
export default function LockScreen() {
  const navigate = useNavigate();
  const isLocked = useSessionStore((s) => s.isLocked);
  const email = useSessionStore((s) => s.email);
  const unlockMaterial = useSessionStore((s) => s.unlockMaterial);
  const unlock = useSessionStore((s) => s.unlock);
  const clear = useSessionStore((s) => s.clear);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // 잠금 상태가 사라지면 입력값/에러 초기화
  useEffect(() => {
    if (!isLocked) {
      setPassword('');
      setError('');
      setPending(false);
    }
  }, [isLocked]);

  // ESC로 닫지 않음 — 잠금 화면은 빠져나갈 수 없음 (로그아웃 버튼만 가능)
  useEffect(() => {
    if (!isLocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isLocked]);

  if (!isLocked || !unlockMaterial) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || pending) return;
    setError('');
    setPending(true);
    try {
      const kek = await deriveKek(password, {
        salt: unlockMaterial!.kdfSalt,
        ...unlockMaterial!.kdfParams,
      });
      const dek = await decrypt(
        kek,
        unlockMaterial!.protectedDek,
        unlockMaterial!.protectedDekIv,
      );
      unlock(dek);
    } catch {
      setError('비밀번호가 올바르지 않습니다');
      setPending(false);
    }
  }

  async function handleLogout() {
    const rt = getRefreshToken();
    if (rt) {
      try { await authApi.logout(rt); } catch { /* ignore */ }
    }
    clear();
    setAccessToken(null);
    setRefreshToken(null);
    navigate('/login', { replace: true });
  }

  return createPortal(
    <div className="lockscreen" role="dialog" aria-modal="true" aria-labelledby="lockscreen-title">
      <div className="lockscreen__backdrop" />
      <div className="lockscreen__card">
        <div className="lockscreen__brand">
          <Logo size={36} />
          <span className="lockscreen__wordmark">SecretBox</span>
        </div>

        <h2 id="lockscreen-title" className="lockscreen__title">
          보관함이 잠겼어요
        </h2>
        <p className="lockscreen__sub">
          마스터 비밀번호를 다시 입력해주세요
        </p>

        {email && (
          <p className="lockscreen__email">{email}</p>
        )}

        <form className="lockscreen__form" onSubmit={handleSubmit} noValidate>
          <FormField
            id="lock-pw"
            type="password"
            autoComplete="current-password"
            autoFocus
            label="마스터 비밀번호"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />

          <Button
            type="submit"
            loading={pending}
            loadingLabel="확인 중…"
          >
            잠금 해제
          </Button>
        </form>

        <button
          type="button"
          className="lockscreen__logout"
          onClick={handleLogout}
        >
          다른 계정으로 로그인
        </button>
      </div>
    </div>,
    document.body,
  );
}
