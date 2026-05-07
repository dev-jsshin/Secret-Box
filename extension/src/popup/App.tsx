import { useEffect, useState } from 'react';
import { sendMessage } from '../shared/messages';

// Day 1 스켈레톤 — popup ↔ background 메시지 루프가 살아있는지만 확인.
// Day 2에서 잠금 해제 폼/항목 리스트로 교체 예정.
export function App() {
  const [bgAck, setBgAck] = useState<string>('checking…');

  useEffect(() => {
    sendMessage({ kind: 'PING', from: 'popup' })
      .then((res) => setBgAck(res.ok ? 'connected' : `err: ${res.error}`))
      .catch((e) => setBgAck(`err: ${String(e)}`));
  }, []);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 1.4, opacity: 0.5, textTransform: 'uppercase' }}>
          Day 1 Skeleton
        </span>
      </header>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>SecretBox</h1>
      <p style={{ margin: 0, opacity: 0.7, fontSize: 13, lineHeight: 1.5 }}>
        확장이 로드됐고, popup ↔ background 메시지 채널이 살아있는지 확인하는 단계.
      </p>
      <div
        style={{
          marginTop: 'auto',
          padding: '10px 12px',
          background: '#17171a',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        background: <span style={{ color: bgAck === 'connected' ? '#7ee787' : '#f0883e' }}>{bgAck}</span>
      </div>
    </div>
  );
}
