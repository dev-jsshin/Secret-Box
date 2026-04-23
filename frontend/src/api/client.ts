const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const REFRESH_KEY = 'secretbox.refreshToken';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // private mode 등 무시
  }
}

/** 401 받은 후 호출하는 refresh 시도. 동시 401 다수 발생 시 한 번만 refresh 하도록 promise 캐시. */
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      accessToken = data.accessToken;
      setRefreshToken(data.refreshToken);   // 회전된 새 토큰
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

interface ExtendedInit extends RequestInit {
  _skipAuthRefresh?: boolean;
}

export async function apiFetch<T>(path: string, init: ExtendedInit = {}): Promise<T> {
  const skipRefresh = init._skipAuthRefresh ?? false;
  // _skipAuthRefresh는 우리 내부 옵션 — fetch에 보내면 안 됨
  const { _skipAuthRefresh, ...fetchInit } = init;

  const doFetch = async (): Promise<Response> => {
    const headers = new Headers(fetchInit.headers);
    headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${BASE_URL}${path}`, { ...fetchInit, headers });
  };

  let res = await doFetch();

  // 401 → refresh 시도 후 한 번만 재시도
  if (res.status === 401 && !skipRefresh && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      // 영구 만료 — 세션 정리 트리거
      setRefreshToken(null);
      accessToken = null;
      if (onSessionExpired) onSessionExpired();
    }
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(
      res.status,
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? res.statusText,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
