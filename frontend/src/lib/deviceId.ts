/**
 * 이 브라우저(localStorage 기준)를 식별하는 안정적인 device id.
 * 서버는 (userId, deviceId)로 활성 세션을 dedup → 같은 기기 재로그인이 row를 누적시키지 않게 한다.
 *
 * NOTE: localStorage가 비워지면 새 device로 인식된다. 그게 의도이기도 함 — 비워졌으면 더 이상 같은 기기라고 보장 못함.
 */
const KEY = 'secretbox.deviceId';

function generate(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 폴백 — 거의 안 쓰일 것
  const bytes = new Uint8Array(16);
  (typeof crypto !== 'undefined' ? crypto : { getRandomValues: (b: Uint8Array) => {
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }}).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length > 0) return existing;
    const fresh = generate();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // private mode 등에서 storage 차단 — 매 호출 새 id (서버는 deviceId 없음으로 처리)
    return generate();
  }
}
