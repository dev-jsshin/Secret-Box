// 세션 상태(KEK + protectedDek + 토큰 + 식별자)를 chrome.storage에 저장한다.
//
// 저장 위치 분리 원칙:
//   chrome.storage.session  → KEK / DEK 재구성에 필요한 비밀 자료. 디스크 미저장(메모리),
//                              브라우저 종료 시 자동 폐기. ZK 모델의 핵심 보관처.
//   chrome.storage.local    → 비밀이 아닌 자료. refreshToken은 비교적 보호 가치가 낮고
//                              (탈취돼도 KEK 없으면 vault 못 봄) 사용자 편의(재로그인 회피)
//                              가치가 큼. lastEmail은 다음 잠금 해제 화면 prefill용.
//
// Uint8Array는 storage에 그대로 못 넣으니 base64로 직렬화한다.

import { base64ToBytes, bytesToBase64 } from '@sb/crypto/base64';

const SESSION_KEY = 'sb.session.v1';
const LOCAL_KEY = 'sb.local.v1';

interface RawSessionBlob {
  kekB64: string;
  protectedDekB64: string;
  protectedDekIvB64: string;
  email: string;
  userId: string;
  unlockedAt: number;
}

interface RawLocalBlob {
  refreshToken?: string;
  lastEmail?: string;
}

export interface UnlockedSession {
  kek: Uint8Array;
  protectedDek: Uint8Array;
  protectedDekIv: Uint8Array;
  email: string;
  userId: string;
  unlockedAt: number;
}

export async function getSessionState(): Promise<UnlockedSession | null> {
  const raw = await chrome.storage.session.get(SESSION_KEY);
  const blob = raw[SESSION_KEY] as RawSessionBlob | undefined;
  if (!blob) return null;
  return {
    kek: base64ToBytes(blob.kekB64),
    protectedDek: base64ToBytes(blob.protectedDekB64),
    protectedDekIv: base64ToBytes(blob.protectedDekIvB64),
    email: blob.email,
    userId: blob.userId,
    unlockedAt: blob.unlockedAt,
  };
}

export async function setSessionState(s: UnlockedSession): Promise<void> {
  const blob: RawSessionBlob = {
    kekB64: bytesToBase64(s.kek),
    protectedDekB64: bytesToBase64(s.protectedDek),
    protectedDekIvB64: bytesToBase64(s.protectedDekIv),
    email: s.email,
    userId: s.userId,
    unlockedAt: s.unlockedAt,
  };
  await chrome.storage.session.set({ [SESSION_KEY]: blob });
}

export async function clearSessionState(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function getLocal(): Promise<RawLocalBlob> {
  const raw = await chrome.storage.local.get(LOCAL_KEY);
  return (raw[LOCAL_KEY] as RawLocalBlob | undefined) ?? {};
}

export async function setLocal(patch: RawLocalBlob): Promise<void> {
  const current = await getLocal();
  await chrome.storage.local.set({ [LOCAL_KEY]: { ...current, ...patch } });
}

export async function clearRefreshToken(): Promise<void> {
  const current = await getLocal();
  delete current.refreshToken;
  await chrome.storage.local.set({ [LOCAL_KEY]: current });
}
