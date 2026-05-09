// 자동 잠금 — chrome.alarms로 N분 후 발화. setTimeout은 SW가 idle로 죽으면
// 사라지므로 alarms API 사용 (브라우저 살아있는 한 정확히 발화).
//
// 사용 패턴:
//   - 잠금 해제 직후 → schedule
//   - 사용자 활동(GET_STATE/LIST_ITEMS/CONTENT_LIST_MATCHES 등) → schedule (덮어씀)
//   - 수동 잠금/세션 만료 → cancel
//   - alarm 발화 → background/index의 onAlarm 핸들러가 lock + broadcast

import { getSettings } from '../shared/settings';

export const AUTO_LOCK_ALARM = 'sb-auto-lock';

export async function scheduleAutoLock(): Promise<void> {
  const { autoLockMinutes } = await getSettings();
  if (!autoLockMinutes || autoLockMinutes <= 0) {
    await chrome.alarms.clear(AUTO_LOCK_ALARM);
    return;
  }
  // chrome.alarms.create는 같은 이름이면 덮어씀 (사실상 reschedule)
  await chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: autoLockMinutes });
}

export async function cancelAutoLock(): Promise<void> {
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
}
