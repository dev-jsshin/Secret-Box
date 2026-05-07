// 확장 설정 — backend URL이 핵심. 본인+친구 LAN 환경에서 각자 host가 다르므로 user-config 필수.
// chrome.storage.local은 디스크에 평문으로 떨어지지만 backend URL은 비밀이 아니므로 OK.
// (KEK는 절대 여기에 두지 않음 — chrome.storage.session에만)

const SETTINGS_KEY = 'sb.settings';

export interface SbSettings {
  backendUrl: string; // 예: https://secretbox.lan/api/v1
}

const DEFAULT_SETTINGS: SbSettings = {
  backendUrl: '',
};

export async function getSettings(): Promise<SbSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = raw[SETTINGS_KEY] as Partial<SbSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function setSettings(patch: Partial<SbSettings>): Promise<SbSettings> {
  const current = await getSettings();
  const next: SbSettings = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function isConfigured(s: SbSettings): boolean {
  return s.backendUrl.trim().length > 0;
}

export function normalizeBackendUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // /api/v1로 끝나지 않으면 자동 부여 — 사용자 실수 방지
  if (/\/api\/v\d+$/.test(trimmed)) return trimmed;
  return `${trimmed}/api/v1`;
}
