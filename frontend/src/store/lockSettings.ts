import { create } from 'zustand';

const KEY = 'secretbox.autolockMs';
const DEFAULT_MS = 15 * 60 * 1000; // 15분

export const LOCK_OPTIONS: { label: string; ms: number | null }[] = [
  { label: '5분', ms: 5 * 60 * 1000 },
  { label: '15분', ms: 15 * 60 * 1000 },
  { label: '30분', ms: 30 * 60 * 1000 },
  { label: '안 함', ms: null },
];

function loadInitial(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return DEFAULT_MS;
    if (v === 'never') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MS;
  } catch {
    return DEFAULT_MS;
  }
}

interface LockSettingsState {
  timeoutMs: number | null;
  setTimeoutMs: (ms: number | null) => void;
}

export const useLockSettings = create<LockSettingsState>((set) => ({
  timeoutMs: loadInitial(),
  setTimeoutMs: (ms) => {
    try {
      if (ms === null) localStorage.setItem(KEY, 'never');
      else localStorage.setItem(KEY, String(ms));
    } catch {
      /* ignore */
    }
    set({ timeoutMs: ms });
  },
}));
