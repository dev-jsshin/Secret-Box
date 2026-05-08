// Vault 항목 가져오기 + 복호화. 풀 평문은 SW 메모리에만 두고, popup에는 요약만 보낸다.
// item plaintext가 메시지 페이로드로 흐르는 건 자동완성 trigger 시점의 GET_ITEM_PLAINTEXT만.

import { apiFetch } from './api';
import { getSessionState } from '../shared/sessionStore';
import { decrypt } from '@sb/crypto/cipher';
import { base64ToBytes } from '@sb/crypto/base64';
import type { ItemSummary, ItemPlaintext } from '../shared/vaultTypes';

interface VaultItemDto {
  id: string;
  itemType: string;
  encryptedData: string;
  encryptedIv: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface RawPlaintext {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  matchUrls?: string;
  totpSecret?: string;
  catalogSlug?: string;
}

// SW 모듈 변수 — 메모리 캐시. SW가 죽으면 다시 채움. KEK은 storage.session에서.
// TTL: 사용자가 vault 본체 앱에서 수정한 후 너무 오래 stale 데이터 보지 않도록 짧게.
// 5초 — chip 매칭이 한 번에 여러 input에서 발사돼도 중복 fetch는 막아주면서, 웹에서 수정한
// 직후 다른 탭으로 옮겨가는 정도의 짧은 시간만 캐시.
const CACHE_TTL_MS = 5_000;
let cache: {
  byId: Map<string, ItemPlaintext>;
  summaries: ItemSummary[];
  fetchedAt: number;
} | null = null;

async function getDek(): Promise<Uint8Array> {
  const session = await getSessionState();
  if (!session) throw new Error('잠금 상태입니다');
  return decrypt(session.kek, session.protectedDek, session.protectedDekIv);
}

export async function refreshVault(): Promise<ItemSummary[]> {
  const dek = await getDek();
  const list = await apiFetch<{ items: VaultItemDto[] }>('/vault/items');

  const byId = new Map<string, ItemPlaintext>();
  const summaries: ItemSummary[] = [];

  for (const dto of list.items) {
    try {
      const ct = base64ToBytes(dto.encryptedData);
      const iv = base64ToBytes(dto.encryptedIv);
      const ptBytes = await decrypt(dek, ct, iv);
      const pt = JSON.parse(new TextDecoder().decode(ptBytes)) as RawPlaintext;

      const item: ItemPlaintext = {
        id: dto.id,
        itemType: dto.itemType,
        name: pt.name,
        username: pt.username,
        password: pt.password,
        url: pt.url,
        totpSecret: pt.totpSecret,
      };
      byId.set(dto.id, item);
      summaries.push({
        id: dto.id,
        itemType: dto.itemType,
        name: pt.name,
        username: pt.username,
        url: pt.url,
        matchUrls: pt.matchUrls,
        catalogSlug: pt.catalogSlug,
        hasTotp: !!pt.totpSecret,
      });
    } catch (err) {
      console.warn('[SecretBox/vault] 복호화 실패', dto.id, err);
    }
  }

  cache = { byId, summaries, fetchedAt: Date.now() };
  return summaries;
}

export async function listSummaries(): Promise<ItemSummary[]> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    return refreshVault();
  }
  return cache.summaries;
}

export async function getItemPlaintext(id: string): Promise<ItemPlaintext | null> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) await refreshVault();
  return cache?.byId.get(id) ?? null;
}

export function clearVaultCache() {
  cache = null;
}
