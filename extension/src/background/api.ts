// 백엔드 호출 래퍼 — frontend/src/api/client.ts의 패턴을 확장 환경에 맞춰 옮김.
// 차이점:
//   - BASE_URL은 settings.backendUrl에서 동적으로 (사용자가 자체 호스팅)
//   - accessToken은 SW 메모리, refreshToken은 storage.local
//   - localStorage 대신 chrome.storage 사용 (SW엔 window/localStorage 없음)
//   - 401 → refresh 회전 → 재시도 패턴 동일

import { getSettings } from '../shared/settings';
import { getLocal, setLocal, clearRefreshToken } from '../shared/sessionStore';

let accessToken: string | null = null;

export function setAccessToken(t: string | null) { accessToken = t; }
export function getAccessToken(): string | null { return accessToken; }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => Promise<void> | void) | null = null;

export function setSessionExpiredHandler(fn: typeof onSessionExpired) {
  onSessionExpired = fn;
}

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const { refreshToken } = await getLocal();
    if (!refreshToken) return false;
    const { backendUrl } = await getSettings();
    if (!backendUrl) return false;
    try {
      const res = await fetch(`${backendUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      accessToken = data.accessToken;
      await setLocal({ refreshToken: data.refreshToken });
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

export interface FetchOpts extends RequestInit {
  /** auth 헤더 없이 호출 (preLogin/login 등) */
  noAuth?: boolean;
  /** 401 시 refresh 시도 안 함 (refresh 자체 + login 직후) */
  skipRefresh?: boolean;
}

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { backendUrl } = await getSettings();
  if (!backendUrl) throw new ApiError(0, 'NO_BACKEND', '백엔드 URL이 설정되지 않았습니다');

  const { noAuth, skipRefresh, headers: initHeaders, ...rest } = opts;

  const buildHeaders = (): Headers => {
    const h = new Headers(initHeaders);
    if (rest.body && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    if (!noAuth && accessToken) h.set('Authorization', `Bearer ${accessToken}`);
    return h;
  };

  let res = await fetch(`${backendUrl}${path}`, { ...rest, headers: buildHeaders() });

  if (res.status === 401 && !noAuth && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(`${backendUrl}${path}`, { ...rest, headers: buildHeaders() });
    } else {
      await clearRefreshToken();
      accessToken = null;
      if (onSessionExpired) await onSessionExpired();
    }
  }

  if (!res.ok) {
    let body: { error?: { code: string; message: string } } | null = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? res.statusText,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
