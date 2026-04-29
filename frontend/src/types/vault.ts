import type { CategorySlug } from '../api/catalog';
import type { VaultItemDto } from '../api/vault';

/**
 * 복호화된 vault item의 내부 구조.
 * encryptedData를 DEK로 풀면 이 형태의 JSON이 나온다.
 *
 * VaultItemDto.itemType ('login' | 'note' | 'card' | 'wifi' | 'apikey')에 따라 사용 필드가 다름:
 *   - 'login':  name, alias?, catalogSlug?, category, username?, password,
 *               url?, notes?, totpSecret?, favorite?
 *   - 'note':   name(=제목), category, content, favorite?
 *   - 'card':   name(=별칭), category, cardholderName, cardNumber, cardExpiry,
 *               cardCvv, cardBrand?, cardPin?, notes?, favorite?
 *   - 'wifi':   name(=SSID 또는 별칭), category, ssid, password,
 *               wifiSecurity?, wifiHidden?, notes?, favorite?
 *   - 'apikey': name(=별칭), category, apiKeyId?, apiKeySecret, apiEnvironment?,
 *               apiExpiresAt?, url?, notes?, favorite?
 */
export interface VaultItemPlaintext {
  // ---------- 공통 ----------
  name: string;
  alias?: string;              // 사용자 정의 별칭 (login)
  catalogSlug?: string;        // 카탈로그 매칭 (login)
  category: CategorySlug;
  favorite?: boolean;
  notes?: string;              // 자유 메모 (login/card/wifi/apikey 공용)

  // ---------- login ----------
  username?: string;
  password?: string;           // login에서 필수, wifi에서도 사용
  url?: string;                // login + apikey
  totpSecret?: string;         // base32 — RFC 6238 TOTP

  // ---------- note ----------
  content?: string;            // note 본문 (자유 텍스트)

  // ---------- card ----------
  cardholderName?: string;     // 카드 명의자
  cardNumber?: string;         // 카드번호 (숫자만 또는 4자리씩 띄움)
  cardExpiry?: string;         // MM/YY 형식
  cardCvv?: string;            // 보안코드 3~4자리
  cardBrand?: string;          // visa | mastercard | amex | jcb | discover | other
  cardPin?: string;            // 카드 PIN (선택)

  // ---------- wifi ----------
  ssid?: string;               // 네트워크 이름 (name과 같을 수도 다를 수도)
  wifiSecurity?: WifiSecurity; // 보안 종류
  wifiHidden?: boolean;        // 숨김 SSID 여부

  // ---------- apikey ----------
  apiKeyId?: string;           // 키 ID 또는 access key id
  apiKeySecret?: string;       // 시크릿 — 가장 중요한 필드
  apiEnvironment?: ApiEnvironment;
  apiExpiresAt?: string;       // ISO 날짜 (선택)
}

export type WifiSecurity = 'WPA2' | 'WPA3' | 'WPA' | 'WEP' | 'open' | 'other';

export type ApiEnvironment = 'production' | 'staging' | 'development' | 'other';

/**
 * 서버에서 받은 항목 + 클라이언트에서 복호화한 평문.
 * UI에서 이 형태로 다룬다.
 */
export interface DecryptedVaultItem extends VaultItemDto {
  plaintext: VaultItemPlaintext;
}
