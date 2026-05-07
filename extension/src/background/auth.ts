// 마스터 비번 잠금 해제 흐름.
//
//   1) preLogin(email)            → KDF salt + params
//   2) Argon2id(password, salt)   → KEK   [offscreen 위임]
//   3) HMAC(KEK, password)        → authHash
//   4) login(email, authHash)     → tokens + protectedDek/Iv  (또는 requires2fa)
//   5) (2FA 필요 시) loginTwoFactor(twoFactorToken, code)     → 동일 응답
//   6) decrypt(KEK, protectedDek) → DEK   (검증 — 실패 시 비번 오류)
//   7) chrome.storage.session에 KEK + protectedDek 저장
//
// 2FA 중간 상태는 SW가 죽어도 살아남도록 chrome.storage.session에 보관 (KEK 포함).
// twoFactorToken은 서버 TTL이 짧으니 만료되면 사용자가 다시 시작.

import { apiFetch, setAccessToken } from './api';
import { callOffscreenArgon2 } from './offscreen';
import { getDeviceId } from './deviceId';
import {
  setSessionState,
  clearSessionState,
  getLocal,
  setLocal,
  type UnlockedSession,
} from '../shared/sessionStore';
import { bytesToBase64, base64ToBytes } from '@sb/crypto/base64';
import { decrypt } from '@sb/crypto/cipher';

interface PreLoginRes {
  kdfSalt: string;
  kdfIterations: number;
  kdfMemoryKb: number;
  kdfParallelism: number;
}

interface LoginRes {
  requires2fa?: boolean;
  twoFactorToken?: string;
  accessToken?: string;
  refreshToken?: string;
  protectedDek?: string;
  protectedDekIv?: string;
  user?: { id: string; email: string };
}

interface PendingTwoFactor {
  twoFactorToken: string;
  kekB64: string;
  email: string;
}
const PENDING_KEY = 'sb.pending2fa.v1';

async function getPending(): Promise<PendingTwoFactor | null> {
  const raw = await chrome.storage.session.get(PENDING_KEY);
  return (raw[PENDING_KEY] as PendingTwoFactor | undefined) ?? null;
}
async function setPending(p: PendingTwoFactor): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: p });
}
async function clearPending(): Promise<void> {
  await chrome.storage.session.remove(PENDING_KEY);
}

async function deriveAuthHashHmac(kek: Uint8Array, password: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    kek as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password) as BufferSource);
  return new Uint8Array(sig);
}

export type UnlockOutcome =
  | { phase: 'unlocked'; email: string; userId: string }
  | { phase: 'awaiting-2fa'; email: string };

export async function unlock(email: string, password: string): Promise<UnlockOutcome> {
  // 1) preLogin
  const params = await apiFetch<PreLoginRes>('/auth/pre-login', {
    method: 'POST',
    body: JSON.stringify({ email }),
    noAuth: true,
  });

  // 2) Argon2 in offscreen
  const passwordB64 = bytesToBase64(new TextEncoder().encode(password));
  const kekB64 = await callOffscreenArgon2({
    passwordB64,
    saltB64: params.kdfSalt,
    iterations: params.kdfIterations,
    memoryKb: params.kdfMemoryKb,
    parallelism: params.kdfParallelism,
  });
  const kek = base64ToBytes(kekB64);

  // 3) authHash = HMAC(KEK, password)
  const authHash = await deriveAuthHashHmac(kek, password);

  // 4) login
  const deviceId = await getDeviceId();
  const result = await apiFetch<LoginRes>('/auth/login', {
    method: 'POST',
    headers: { 'X-Device-Id': deviceId },
    body: JSON.stringify({ email, authHash: bytesToBase64(authHash) }),
    noAuth: true,
    skipRefresh: true,
  });

  if (result.requires2fa && result.twoFactorToken) {
    await setPending({ twoFactorToken: result.twoFactorToken, kekB64, email });
    return { phase: 'awaiting-2fa', email };
  }

  return finishLogin(result, kek, email);
}

export async function unlock2fa(code: string): Promise<UnlockOutcome> {
  const pending = await getPending();
  if (!pending) throw new Error('2FA 진행 중이 아닙니다 — 처음부터 다시 시도하세요');

  const deviceId = await getDeviceId();
  const result = await apiFetch<LoginRes>('/auth/login-2fa', {
    method: 'POST',
    headers: { 'X-Device-Id': deviceId },
    body: JSON.stringify({ twoFactorToken: pending.twoFactorToken, code }),
    noAuth: true,
    skipRefresh: true,
  });

  const kek = base64ToBytes(pending.kekB64);
  await clearPending();
  return finishLogin(result, kek, pending.email);
}

async function finishLogin(
  result: LoginRes,
  kek: Uint8Array,
  email: string,
): Promise<UnlockOutcome> {
  if (
    !result.accessToken || !result.refreshToken ||
    !result.protectedDek || !result.protectedDekIv ||
    !result.user
  ) {
    throw new Error('서버 응답이 불완전합니다');
  }
  const protectedDek = base64ToBytes(result.protectedDek);
  const protectedDekIv = base64ToBytes(result.protectedDekIv);

  // KEK가 맞는지 검증 — 풀어보고 실패하면 비번 오류로 간주.
  // (서버는 비번 자체는 못 보고 authHash만 검증하므로 여기서 cryptographic 검증 필수)
  await decrypt(kek, protectedDek, protectedDekIv);

  setAccessToken(result.accessToken);
  await setLocal({ refreshToken: result.refreshToken, lastEmail: email });

  const session: UnlockedSession = {
    kek,
    protectedDek,
    protectedDekIv,
    email,
    userId: result.user.id,
    unlockedAt: Date.now(),
  };
  await setSessionState(session);

  return { phase: 'unlocked', email, userId: result.user.id };
}

export async function lock(): Promise<void> {
  setAccessToken(null);
  await clearSessionState();
  await clearPending();
  // refreshToken은 lock 시점에는 남겨두어 다음 unlock에서 자동 재인증 가능케 함.
  // (사용자가 "전체 로그아웃"을 누르면 그때 별도로 refresh 폐기)
}

export async function getLastEmail(): Promise<string | null> {
  const local = await getLocal();
  return local.lastEmail ?? null;
}

export async function getPendingEmail(): Promise<string | null> {
  const p = await getPending();
  return p?.email ?? null;
}
