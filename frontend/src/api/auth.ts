import { apiFetch } from './client';

export interface PreLoginResponse {
  kdfSalt: string;
  kdfIterations: number;
  kdfMemoryKb: number;
  kdfParallelism: number;
}

/**
 * v1: 2FA 미구현 → 로그인 응답에 access token + protected DEK 직접 포함.
 * v2 추가 예정: 2FA enabled 사용자는 { twoFactorRequired: true, twoFactorToken } 반환.
 */
export interface LoginResponse {
  accessToken: string;
  protectedDek: string;       // base64
  protectedDekIv: string;     // base64
  user: { id: string; email: string };
}

export interface RegisterRequest {
  email: string;
  authHash: string;
  kdfSalt: string;
  kdfIterations: number;
  kdfMemoryKb: number;
  kdfParallelism: number;
  protectedDek: string;
  protectedDekIv: string;
  recoveryCodeHash?: string;
}

export const authApi = {
  register: (body: RegisterRequest) =>
    apiFetch<{ userId: string; email: string; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  preLogin: (email: string) =>
    apiFetch<PreLoginResponse>('/auth/pre-login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  login: (email: string, authHash: string) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, authHash }),
    }),
};
