import { apiFetch } from './client';

export interface VaultItemDto {
  id: string;
  itemType: string;
  encryptedData: string;
  encryptedIv: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemHistoryDto {
  id: string;
  changeType: 'updated' | 'restored';
  encryptedData: string;
  encryptedIv: string;
  changedAt: string;
}

export const vaultApi = {
  list: () => apiFetch<{ items: VaultItemDto[] }>('/vault/items'),

  create: (body: { itemType: string; encryptedData: string; encryptedIv: string }) =>
    apiFetch<VaultItemDto>('/vault/items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (
    id: string,
    body: { encryptedData: string; encryptedIv: string; expectedVersion: number }
  ) =>
    apiFetch<VaultItemDto>(`/vault/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/vault/items/${id}`, { method: 'DELETE' }),

  history: (id: string) =>
    apiFetch<{ itemId: string; history: VaultItemHistoryDto[] }>(`/vault/items/${id}/history`),

  restoreVersion: (id: string, historyId: string) =>
    apiFetch<VaultItemDto>(`/vault/items/${id}/restore-version/${historyId}`, {
      method: 'POST',
    }),
};
