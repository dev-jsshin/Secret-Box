// 확장 인스턴스(브라우저 프로필 + 확장 ID 단위)를 식별하는 안정 device id.
// 서버는 (userId, deviceId)로 활성 세션 dedup. localStorage가 없는 SW 환경이라
// chrome.storage.local에 저장.

import { getLocal, setLocal } from '../shared/sessionStore';

const DEVICE_KEY_FIELD = '__deviceId';

interface LocalWithDevice {
  __deviceId?: string;
}

export async function getDeviceId(): Promise<string> {
  const local = (await chrome.storage.local.get(DEVICE_KEY_FIELD)) as LocalWithDevice;
  if (local.__deviceId) return local.__deviceId;

  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ __deviceId: fresh });
  return fresh;
}

// getLocal/setLocal은 sb.local.v1 키만 다루지만 deviceId는 별도 top-level 키.
// 의도적 — refreshToken과 분리해서 logout/clear 시 deviceId 보존.
export { getLocal, setLocal };
