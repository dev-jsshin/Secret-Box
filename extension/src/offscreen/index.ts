// Offscreen Document — service worker에서 못 굴리는 무거운 wasm/DOM 작업 전용 컨텍스트.
// MV3에서 Argon2(hash-wasm)는 SW에서도 가능하지만 cold start가 느려 popup 응답성이 나빠짐.
// 여기에 분리해두면 KEK 파생을 background → offscreen으로 위임 가능.
// Day 1 스켈레톤은 준비 완료 신호만.

import { sendMessage } from '../shared/messages';

(async () => {
  const res = await sendMessage({ kind: 'PING', from: 'offscreen' });
  console.log('[SecretBox/offscreen] ready, bg ack:', res);
})();
