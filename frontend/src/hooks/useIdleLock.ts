import { useEffect } from 'react';

import { useSessionStore } from '../store/session';
import { useLockSettings } from '../store/lockSettings';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

/**
 * 활동 감지 후 일정 시간 idle이면 lock() 호출.
 * 잠금/로그아웃 상태에서는 동작하지 않는다.
 */
export function useIdleLock() {
  const dek = useSessionStore((s) => s.dek);
  const isLocked = useSessionStore((s) => s.isLocked);
  const lock = useSessionStore((s) => s.lock);
  const timeoutMs = useLockSettings((s) => s.timeoutMs);

  useEffect(() => {
    if (!dek || isLocked || timeoutMs == null) return;

    let timer: number;

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock(), timeoutMs);
    };

    const handler = () => reset();
    ACTIVITY_EVENTS.forEach((ev) =>
      document.addEventListener(ev, handler, { passive: true }),
    );
    reset();

    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, handler));
    };
  }, [dek, isLocked, timeoutMs, lock]);
}
