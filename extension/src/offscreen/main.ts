// Offscreen 문서. background가 ensureOffscreen으로 불러올린 뒤 OFFSCREEN_ARGON2 메시지를
// 보내면 hash-wasm으로 KEK를 파생해 응답한다.
//
// 메시지 응답을 비동기로 보내려면 onMessage 리스너에서 true를 반환해 채널을 열어둔다.

import { argon2id } from 'hash-wasm';
import { base64ToBytes, bytesToBase64 } from '@sb/crypto/base64';
import type { SbMessage, SbResponse } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (msg: SbMessage, _sender, sendResponse: (r: SbResponse) => void) => {
    if (msg.kind !== 'OFFSCREEN_ARGON2') return false;

    (async () => {
      try {
        const password = base64ToBytes(msg.passwordB64);
        const salt = base64ToBytes(msg.saltB64);
        const hex = await argon2id({
          password: new TextDecoder().decode(password),
          salt,
          iterations: msg.iterations,
          memorySize: msg.memoryKb,
          parallelism: msg.parallelism,
          hashLength: 32,
          outputType: 'hex',
        });
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) {
          out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        sendResponse({ ok: true, data: bytesToBase64(out) });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'argon2 실패',
        });
      }
    })();

    return true; // 비동기 응답 채널 유지
  },
);

console.log('[SecretBox/offscreen] ready');
