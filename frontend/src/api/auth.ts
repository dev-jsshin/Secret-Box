import { apiFetch } from './client';

export interface PreLoginResponse {
  kdfSalt: string;
  kdfIterations: number;
  kdfMemoryKb: number;
  kdfParallelism: number;
}

export interface LoginResponse {
  twoFactorRequired: boolean;
  twoFactorToken: string;
  method: 'email';
}

export interface TwoFactorVerifyResponse {
  accessToken: string;
  refreshToken: string;
  protectedDek: string;
  protectedDekIv: string;
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

  verifyTwoFactor: (twoFactorToken: string, code: string) =>
    apiFetch<TwoFactorVerifyResponse>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ twoFactorToken, code }),
    }),

  resendTwoFactor: (twoFactorToken: string) =>
    apiFetch<void>('/auth/2fa/resend', {
      method: 'POST',
      body: JSON.stringify({ twoFactorToken }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken: string) =>
    apiFetch<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
};
