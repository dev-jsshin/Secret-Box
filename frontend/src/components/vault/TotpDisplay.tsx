import { useEffect, useRef, useState } from 'react';

import { generateTotp } from '../../lib/totp';

interface TotpDisplayProps {
  secret: string;
  visible: boolean;
  isCopied: boolean;
  onCopy: (code: string) => void;
}

const PERIOD = 30;

/**
 * 30초마다 회전하는 6자리 TOTP 코드를 표시.
 * 1초 간격으로 카운트다운 갱신, 30초 경계마다 새 코드 계산.
 * 클릭 시 onCopy(현재 코드)로 부모에 통지.
 */
export default function TotpDisplay({ secret, visible, isCopied, onCopy }: TotpDisplayProps) {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(PERIOD);
  const [error, setError] = useState(false);
  const codeRef = useRef('------');

  useEffect(() => {
    let cancelled = false;
    let lastCounter = -1;

    async function tick() {
      const now = Math.floor(Date.now() / 1000);
      const counter = Math.floor(now / PERIOD);
      const r = PERIOD - (now % PERIOD);

      if (cancelled) return;
      setRemaining(r);

      if (counter !== lastCounter) {
        lastCounter = counter;
        try {
          const c = await generateTotp(secret, { timestamp: now });
          if (cancelled) return;
          setCode(c);
          codeRef.current = c;
          setError(false);
        } catch {
          if (cancelled) return;
          setError(true);
          setCode('------');
          codeRef.current = '------';
        }
      }
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [secret]);

  function handleClick() {
    if (error) return;
    onCopy(codeRef.current);
  }

  if (error) {
    return (
      <span className="vault__totp vault__totp--error" title="secret 형식이 잘못됨">
        <span className="vault__totpCode">2FA 오류</span>
      </span>
    );
  }

  const formatted = !visible
    ? '••• •••'
    : code.length === 6
      ? `${code.slice(0, 3)} ${code.slice(3)}`
      : code;
  // 시각적 진행률 (남은 시간 → 원호 % 표현)
  const progress = remaining / PERIOD; // 1 → 0
  // SVG 원: 둘레 길이 ~50.27 (r=8). dash로 채워진 길이 표현
  const circumference = 2 * Math.PI * 8;
  const dash = circumference * progress;

  return (
    <button
      type="button"
      className={'vault__totp' + (isCopied ? ' vault__totp--copied' : '')}
      onClick={handleClick}
      title={isCopied ? '복사됨' : 'TOTP 코드 복사'}
      aria-label="TOTP 코드 복사"
    >
      <span className="vault__totpCode">{formatted}</span>
      <svg className="vault__totpRing" viewBox="0 0 20 20" width="18" height="18" aria-hidden>
        <circle
          cx="10" cy="10" r="8"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2"
        />
        <circle
          cx="10" cy="10" r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 10 10)"
        />
      </svg>
    </button>
  );
}
