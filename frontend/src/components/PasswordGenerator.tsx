import { useEffect, useState } from 'react';

import {
  DEFAULT_GENERATE_OPTIONS,
  LENGTH_MAX,
  LENGTH_MIN,
  generatePassword,
  type GenerateOptions,
} from '../lib/passwordGen';
import { scorePassword } from '../lib/passwordTools';

import './PasswordGenerator.css';

interface Props {
  /** 생성된 패스워드를 받아 input에 즉시 채우는 콜백. 옵션 변화/재생성 시마다 호출. */
  onGenerate: (password: string) => void;
}

/**
 * 패스워드 생성기 — Live-fill 패턴.
 * 마운트 즉시 생성 + onGenerate 호출 → 부모의 password 필드에 자동 채워짐.
 * 옵션을 만지면 실시간 재생성 + onGenerate 다시 호출.
 * 별도 "사용" 버튼 X — 입력 필드에 이미 들어가 있으니 닫기만 하면 됨.
 */
export default function PasswordGenerator({ onGenerate }: Props) {
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_GENERATE_OPTIONS);
  const [current, setCurrent] = useState<string>('');

  // 옵션 변경 / 마운트 시 재생성
  useEffect(() => {
    const pw = generatePassword(opts);
    setCurrent(pw);
    onGenerate(pw);
    // onGenerate은 매 변경마다 호출돼야 하므로 deps에서 제외 (안정 함수 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  function regen() {
    const pw = generatePassword(opts);
    setCurrent(pw);
    onGenerate(pw);
  }

  function toggle(key: keyof GenerateOptions) {
    setOpts((cur) => {
      const next = { ...cur, [key]: !cur[key] };
      // 모든 카테고리 해제 방지 — 마지막 하나는 강제 유지
      if (!next.upper && !next.lower && !next.digits && !next.symbols) {
        return cur;
      }
      return next;
    });
  }

  const strength = scorePassword(current);

  return (
    <div className="pwg" role="region" aria-label="패스워드 생성기">
      {/* 길이 + 강도 한 줄에 */}
      <div className="pwg__topRow">
        <label className="pwg__lenLabel" htmlFor="pwg-len">
          길이 <span className="pwg__lenValue">{opts.length}</span>
        </label>
        <div className="pwg__strength" aria-label={`강도: ${strength.label}`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={
                'pwg__strengthBar'
                + (strength.score >= n ? ' is-on' : '')
                + ` is-tone-${strength.score}`
              }
            />
          ))}
        </div>
      </div>

      <input
        id="pwg-len"
        type="range"
        className="pwg__slider"
        min={LENGTH_MIN}
        max={LENGTH_MAX}
        value={opts.length}
        onChange={(e) => setOpts((c) => ({ ...c, length: Number(e.target.value) }))}
      />

      {/* 카테고리 토글 + 다시 생성 */}
      <div className="pwg__bottomRow">
        <div className="pwg__toggles">
          <Toggle label="A-Z" checked={opts.upper} onChange={() => toggle('upper')} />
          <Toggle label="a-z" checked={opts.lower} onChange={() => toggle('lower')} />
          <Toggle label="0-9" checked={opts.digits} onChange={() => toggle('digits')} />
          <Toggle label="!@#" checked={opts.symbols} onChange={() => toggle('symbols')} />
        </div>
        <button
          type="button"
          className="pwg__regenBtn"
          onClick={regen}
          title="다시 생성"
          aria-label="다시 생성"
        >
          <RefreshIcon />
        </button>
      </div>

      <label className="pwg__checkRow">
        <input
          type="checkbox"
          checked={opts.excludeAmbiguous}
          onChange={() => setOpts((c) => ({ ...c, excludeAmbiguous: !c.excludeAmbiguous }))}
        />
        <span>유사 문자 제외 (i, l, 1, o, 0)</span>
      </label>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={'pwg__toggle' + (checked ? ' is-on' : '')}
      onClick={onChange}
      aria-pressed={checked}
    >
      {label}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 18 18" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14 3 14 7 10 7" />
      <path d="M14 7A6 6 0 1 0 13 13" />
    </svg>
  );
}
