import { apiFetch } from './client';
import { getDeviceId } from '../lib/deviceId';

export interface PreLoginResponse {
  kdfSalt: string;
  kdfIterations: number;
  kdfMemoryKb: number;
  kdfParallelism: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  protectedDek: string;       // base64
  protectedDekIv: string;     // base64
  user: { id: string; email: string };
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;       // 회전된 새 토큰
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
      headers: { 'X-Device-Id': getDeviceId() },
      body: JSON.stringify({ email, authHash }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      // refresh 자체에선 자동 재시도 비활성화 (무한 루프 방지)
      _skipAuthRefresh: true,
    } as RequestInit),

  logout: (refreshToken: string) =>
    apiFetch<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      _skipAuthRefresh: true,
    } as RequestInit),
};
