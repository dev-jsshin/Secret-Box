// popup이 필요로 하는 vault 항목의 최소 형태. 풀 평문(VaultItemPlaintext)은 background에만
// 살고, 자동완성 trigger 시점에만 필요한 것만 content script로 흐른다.
//
// frontend의 VaultItemPlaintext를 그대로 가져오면 popup도 모든 평문을 보게 되는데,
// 그럴 필요는 없음 — 검색/리스트는 name/username/url + matchedHost 정도만 충분.

export interface ItemSummary {
  id: string;
  itemType: 'login' | 'note' | 'card' | 'wifi' | 'apikey' | string;
  name: string;
  username?: string;
  url?: string;
  matchUrls?: string;        // 자동완성 매칭 전용 — 비어있으면 url로 fallback
  catalogSlug?: string;
  hasTotp: boolean;
}

export interface ItemPlaintext {
  id: string;
  itemType: ItemSummary['itemType'];
  name: string;
  username?: string;
  password?: string;
  url?: string;
  totpSecret?: string;
}
