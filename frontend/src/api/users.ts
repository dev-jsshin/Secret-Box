import { apiFetch } from './client';

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

export const usersApi = {
  changePassword: (body: ChangePasswordRequest) =>
    apiFetch<ChangePasswordResponse>('/users/me/password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
