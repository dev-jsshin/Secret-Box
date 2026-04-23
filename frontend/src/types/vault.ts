import type { CategorySlug } from '../api/catalog';
import type { VaultItemDto } from '../api/vault';

/**
 * 복호화된 vault item의 내부 구조.
 * encryptedData를 DEK로 풀면 이 형태의 JSON이 나온다.
 */
export interface VaultItemPlaintext {
  name: string;
  catalogSlug?: string;        // 카탈로그 매칭 (있으면)
  category: CategorySlug;
  username?: string;
  password: string;
  url?: string;
  notes?: string;
  favorite?: boolean;
}

/**
 * 서버에서 받은 항목 + 클라이언트에서 복호화한 평문.
 * UI에서 이 형태로 다룬다.
 */
export interface DecryptedVaultItem extends VaultItemDto {
  plaintext: VaultItemPlaintext;
}
