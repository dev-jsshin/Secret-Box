/**
 * 복호화된 vault item의 내부 구조.
 * encryptedData를 DEK로 풀면 이 타입이 나온다.
 */
export interface VaultItemPlaintext {
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  favorite?: boolean;
}
