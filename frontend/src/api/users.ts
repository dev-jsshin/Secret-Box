import { apiFetch, getRefreshToken } from './client';
import { getDeviceId } from '../lib/deviceId';

export interface ChangePasswordRequest {
  oldAuthHash: string;
  newAuthHash: string;
  newKdfSalt: string;
  newKdfIterations: number;
  newKdfMemoryKb: number;
  newKdfParallelism: number;
  newProtectedDek: string;
  newProtectedDekIv: string;
}

export interface ChangePasswordResponse {
  accessToken: string;
  refreshToken: string;
  message: string;
}

export interface SessionListItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionListResponse {
  sessions: SessionListItem[];
}

export interface RevokeOthersResponse {
  revokedCount: number;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
}

export interface TwoFactorInitResponse {
  secret: string;       // base32
  otpauthUri: string;   // QR 인코딩 또는 직접 표시
}

export interface TwoFactorEnableConfirmResponse {
  recoveryCode: string;   // 32자 long single-use kill switch — 한 번만 응답
}

export interface AuditLogEntry {
  id: number;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;       // ISO
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  page: number;
  size: number;
  totalElements: number;
  hasNext: boolean;
}

export const usersApi = {
  changePassword: (body: ChangePasswordRequest) =>
    apiFetch<ChangePasswordResponse>('/users/me/password', {
      method: 'POST',
      headers: { 'X-Device-Id': getDeviceId() },
      body: JSON.stringify(body),
    }),

  listSessions: () =>
    apiFetch<SessionListResponse>('/users/me/sessions', {
      method: 'GET',
      headers: { 'X-Current-Refresh': getRefreshToken() ?? '' },
    }),

  revokeSession: (sessionId: string) =>
    apiFetch<void>(`/users/me/sessions/${sessionId}/revoke`, {
      method: 'POST',
    }),

  revokeOtherSessions: () =>
    apiFetch<RevokeOthersResponse>('/users/me/sessions/revoke-others', {
      method: 'POST',
      body: JSON.stringify({ currentRefreshToken: getRefreshToken() ?? '' }),
    }),

  // ---------------- 2FA ----------------
  getTwoFactorStatus: () =>
    apiFetch<TwoFactorStatusResponse>('/users/me/2fa', { method: 'GET' }),

  initTwoFactor: () =>
    apiFetch<TwoFactorInitResponse>('/users/me/2fa/init', { method: 'POST' }),

  confirmTwoFactor: (code1: string, code2: string) =>
    apiFetch<TwoFactorEnableConfirmResponse>('/users/me/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code1, code2 }),
    }),

  disableTwoFactor: (code: string) =>
    apiFetch<void>('/users/me/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // ---------------- 활동 로그 ----------------
  getActivity: (page: number = 0, size: number = 30) =>
    apiFetch<AuditLogPage>(
      `/users/me/activity?page=${page}&size=${size}`,
      { method: 'GET' },
    ),
};
