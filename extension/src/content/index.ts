// Content Script — 모든 http(s) 페이지에 주입. DOM에 접근하지만 페이지의 JS context와는
// 격리된다(같은 DOM, 다른 글로벌). Day 1 스켈레톤은 readyState만 백그라운드에 알리는 수준.
// Day 4에서 form 감지 + 자동완성 칩 주입으로 확장 예정.

import { sendMessage } from '../shared/messages';

(async () => {
  const res = await sendMessage({ kind: 'PING', from: 'content' });
  console.log('[SecretBox/content]', location.host, 'bg ack:', res);
})();
