import { create } from 'zustand';

/**
 * 세션 스토어. DEK는 반드시 메모리에만 보관하며 새로고침 시 사라진다.
 * 새로고침하면 다시 로그인(마스터 패스워드 입력)을 요구한다.
 */
interface SessionState {
  userId: string | null;
  email: string | null;
  accessToken: string | null;
  dek: Uint8Array | null;
  setSession: (s: Omit<SessionState, 'setSession' | 'clear'>) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  email: null,
  accessToken: null,
  dek: null,
  setSession: (s) => set(s),
  clear: () =>
    set({ userId: null, email: null, accessToken: null, dek: null }),
}));
