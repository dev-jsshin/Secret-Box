// 기본값은 상대 경로. Vite dev server(또는 프로덕션 리버스 프록시)가 /api를 백엔드로 중계.
// 다른 PC에서 접속해도 브라우저 입장에서 same-origin이라 CORS/호스트 문제가 없다.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = await res.json();
    } catch { /* non-JSON error */ }
    throw new ApiError(
      res.status,
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? res.statusText
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
