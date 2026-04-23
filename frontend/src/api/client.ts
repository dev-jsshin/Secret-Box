const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:6333/api/v1';

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
