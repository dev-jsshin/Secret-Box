// host 매칭 — 항목의 URL 필드를 다양한 형태로 받아 등급 매긴다.
//
// 사용자가 항목에 url 필드로 넣을 수 있는 형태:
//   1) 풀 URL:   "https://github.com" / "github.com" / "github.com:8443"
//   2) 키워드:   "naver"  → 현재 host에 substring으로 들어있으면 매칭
//   3) 다중:     "naver, naver.com, m.naver.com" 또는 줄바꿈으로 구분
//
// 등급:
//   3 = exact host
//   2 = suffix (한쪽이 다른쪽 서브도메인) 또는 키워드 매칭
//   1 = root domain만 공유 (signin.aws.amazon.com vs console.aws.amazon.com)
//   0 = no match
//
// 다중 토큰이 있으면 가장 높은 등급을 그 항목의 최종 점수로 채택.
//
// 한계: PSL을 끌어오지 않고 흔한 2-label TLD만 하드코딩 — co.kr/co.uk/com.au 등.

const TWO_PART_TLDS = new Set([
  // KR
  'co.kr', 'com.kr', 'or.kr', 'ne.kr', 'ac.kr', 'go.kr', 'pe.kr', 're.kr',
  // UK
  'co.uk', 'org.uk', 'me.uk', 'gov.uk', 'ac.uk', 'net.uk',
  // JP
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  // AU
  'com.au', 'org.au', 'net.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // 자주 보는 것
  'com.br', 'com.mx', 'com.cn', 'com.tw', 'com.hk', 'com.sg',
]);

export function rootDomain(host: string): string {
  if (!host) return '';
  const lower = host.toLowerCase();
  const parts = lower.split('.');
  if (parts.length <= 2) return lower;

  const last2 = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(last2) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return last2;
}

export function hostsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return rootDomain(a) === rootDomain(b);
}

/** 입력 토큰이 도메인/URL 형태인지(점/슬래시/콜론 포함) 검사. 아니면 키워드. */
function isKeyword(token: string): boolean {
  return token.length > 0 && !/[./:]/.test(token);
}

/** 도메인/URL 형태의 토큰 → host 추출 시도. 실패 시 null. */
function parseHost(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  try {
    // 프로토콜 없으면 임시로 붙여서 URL 파싱 — host만 뽑을 거라 무방.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

/** host vs host 비교 — exact > suffix > root domain. */
function scoreHostPair(itemHost: string, currentHost: string): number {
  const cur = currentHost.toLowerCase();
  if (itemHost === cur) return 3;
  if (cur.endsWith('.' + itemHost) || itemHost.endsWith('.' + cur)) return 2;
  if (rootDomain(itemHost) === rootDomain(cur)) return 1;
  return 0;
}

/**
 * 단일 토큰(한 줄)에 대한 점수.
 *
 * 키워드 매칭 안전장치:
 *   `host.includes(keyword)`는 LIKE %x% 라 'mynaverstuff.com' 같은 false positive 발생.
 *   호스트를 비문자(`.`, `-` 등)로 쪼갠 label들 중 정확히 키워드와 같은 게 하나라도 있을 때만 매칭.
 *   예: 'naver' → ['m','naver','com'] 안에 'naver' 정확히 있음 → ✓
 *       'naver' → ['mynaverstuff','com'] 안에 'naver' 없음 → ✗
 */
function scoreToken(token: string, currentHost: string): number {
  const t = token.trim();
  if (!t) return 0;

  if (isKeyword(t)) {
    const labels = currentHost.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return labels.includes(t.toLowerCase()) ? 2 : 0;
  }
  const host = parseHost(t);
  if (!host) return 0;
  return scoreHostPair(host, currentHost);
}

/**
 * 항목의 url 필드 전체에 대한 등급. 콤마/줄바꿈으로 구분된 다중 토큰 중 최고 점수.
 */
export function urlHostMatchScore(itemUrl: string | undefined, currentHost: string): number {
  if (!itemUrl || !currentHost) return 0;
  const tokens = itemUrl.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return 0;
  return Math.max(...tokens.map((t) => scoreToken(t, currentHost)));
}

export function urlHostMatches(itemUrl: string | undefined, currentHost: string): boolean {
  return urlHostMatchScore(itemUrl, currentHost) > 0;
}

/**
 * matchUrls이 채워져 있으면 그것만, 비어있으면 url로 fallback. 1Password의
 * "website + URLs" 분리 모델 — 표시용 URL과 자동완성 매칭용 URL을 분리.
 */
export function itemMatchScore(
  item: { url?: string; matchUrls?: string },
  currentHost: string,
): number {
  const effective = item.matchUrls?.trim() || item.url;
  return urlHostMatchScore(effective, currentHost);
}

export function itemMatches(
  item: { url?: string; matchUrls?: string },
  currentHost: string,
): boolean {
  return itemMatchScore(item, currentHost) > 0;
}

/** 입력 항목들 중 가장 높은 등급의 매칭만 골라낸다. matchUrls 우선. */
export function pickBestTier<T extends { url?: string; matchUrls?: string }>(
  items: T[],
  currentHost: string,
): T[] {
  const scored = items
    .map((it) => ({ it, score: itemMatchScore(it, currentHost) }))
    .filter((s) => s.score > 0);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.it);
}
