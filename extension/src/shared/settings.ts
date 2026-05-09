// 확장 설정 — backend URL이 핵심. 본인+친구 LAN 환경에서 각자 host가 다르므로 user-config 필수.
// chrome.storage.local은 디스크에 평문으로 떨어지지만 backend URL은 비밀이 아니므로 OK.
// (KEK는 절대 여기에 두지 않음 — chrome.storage.session에만)

const SETTINGS_KEY = 'sb.settings';

export interface SbSettings {
  backendUrl: string;          // 예: https://secretbox.lan/api/v1
  totpAutofill: boolean;       // 2FA 페이지에서 TOTP 자동 입력 (기본 true)
  totpAutoSubmit: boolean;     // 자동 입력 후 submit까지 자동 (기본 false — 사용자가 명시적 활성화)
  autoLockMinutes: number;     // idle N분 후 자동 잠금 (0 = 끄기, 기본 15)
}

export const AUTO_LOCK_OPTIONS = [
  { value: 0,  label: '안 함' },
  { value: 5,  label: '5분' },
  { value: 15, label: '15분' },
  { value: 30, label: '30분' },
  { value: 60, label: '1시간' },
];

// DEV: 개발 중인 LAN 백엔드 — 확장 설치/업데이트 시 자동 시드 (background/index.ts).
// 배포 패키징 (Day 7) 전에 빈 문자열로 되돌릴 것.
export const DEV_DEFAULT_BACKEND_URL = 'http://10.23.12.69:6334/api/v1';

const DEFAULT_SETTINGS: SbSettings = {
  backendUrl: DEV_DEFAULT_BACKEND_URL,
  totpAutofill: true,
  totpAutoSubmit: false,
  autoLockMinutes: 15,
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
