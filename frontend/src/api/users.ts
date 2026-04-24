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
};
