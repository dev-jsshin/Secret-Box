import { create } from 'zustand';

/**
 * 세션 스토어. DEK는 반드시 메모리에만 보관하며 새로고침 시 사라진다.
 *
 * 자동 잠금:
 *   - lock(): DEK만 비우고 isLocked=true. unlockMaterial은 메모리에 남겨두어
 *     서버 호출 없이 마스터 비번만으로 다시 풀 수 있게 한다.
 *   - unlock(dek): 다시 풀린 DEK를 채우고 isLocked=false.
 *   - clear(): 완전 로그아웃 — 모든 자료 폐기.
 */
export interface KdfParams {
  iterations: number;
  memoryKb: number;
  parallelism: number;
}

export interface UnlockMaterial {
  protectedDek: Uint8Array;
  protectedDekIv: Uint8Array;
  kdfSalt: Uint8Array;
  kdfParams: KdfParams;
}

export interface SessionPayload {
  userId: string;
  email: string;
  accessToken: string;
  dek: Uint8Array;
  unlock: UnlockMaterial;
}

interface SessionState {
  userId: string | null;
  email: string | null;
  accessToken: string | null;
  dek: Uint8Array | null;
  isLocked: boolean;
  unlockMaterial: UnlockMaterial | null;
  setSession: (s: SessionPayload) => void;
  lock: () => void;
  unlock: (dek: Uint8Array) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  email: null,
  accessToken: null,
  dek: null,
  isLocked: false,
  unlockMaterial: null,
  setSession: (s) =>
    set({
      userId: s.userId,
      email: s.email,
      accessToken: s.accessToken,
      dek: s.dek,
      unlockMaterial: s.unlock,
      isLocked: false,
    }),
  lock: () => set({ dek: null, isLocked: true }),
  unlock: (dek) => set({ dek, isLocked: false }),
  clear: () =>
    set({
      userId: null,
      email: null,
      accessToken: null,
      dek: null,
      isLocked: false,
      unlockMaterial: null,
    }),
}));
