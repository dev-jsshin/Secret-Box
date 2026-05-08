// "방금 어느 항목으로 채웠는지" 추적. 2FA 페이지가 같은 root domain에서 곧이어 뜨면
// 그 항목의 totpSecret으로 TOTP 자동 입력 가능. 5분 지나면 만료 (오래된 fill을
// 같은 사이트 재방문 시 잘못 매칭하는 사고 방지).

import { hostsMatch } from '../shared/hostMatch';

const KEY = 'sb.lastFill.v1';
const TTL_MS = 5 * 60 * 1000;

interface LastFill {
  itemId: string;
  host: string;
  ts: number;
}

export async function recordLastFill(itemId: string, host: string): Promise<void> {
  const blob: LastFill = { itemId, host, ts: Date.now() };
  await chrome.storage.session.set({ [KEY]: blob });
}

export async function getLastFillFor(host: string): Promise<LastFill | null> {
  const raw = await chrome.storage.session.get(KEY);
  const blob = raw[KEY] as LastFill | undefined;
  if (!blob) return null;
  if (Date.now() - blob.ts > TTL_MS) return null;
  if (!hostsMatch(blob.host, host)) return null;
  return blob;
}

export async function clearLastFill(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}
