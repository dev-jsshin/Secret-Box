import { useEffect, useState } from 'react';

import {
  DEFAULT_GENERATE_OPTIONS,
  LENGTH_MAX,
  LENGTH_MIN,
  generatePassword,
  type GenerateOptions,
} from '../lib/passwordGen';

import './PasswordGenerator.css';

interface Props {
  /** 생성된 패스워드를 받아 input에 즉시 채우는 콜백. 옵션 변화/재생성 시마다 호출. */
  onGenerate: (password: string) => void;
}

/**
 * 패스워드 생성기 — Live-fill 패턴.
 * 옵션 패널만 보여준다. 강도 미터는 부모(폼 측)가 입력 필드에 인라인 표시.
 *
 * 마운트 즉시 첫 생성 → onGenerate 콜백으로 부모 비번 input에 자동 채워짐.
 * 옵션 변경 시 실시간 재생성 + onGenerate 다시 호출.
 */
export default function PasswordGenerator({ onGenerate }: Props) {
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULT_GENERATE_OPTIONS);

  // 옵션 변경 / 마운트 시 재생성
  useEffect(() => {
    onGenerate(generatePassword(opts));
    // onGenerate은 매 변경마다 호출돼야 하므로 deps에서 제외 (안정 함수 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  function regen() {
    onGenerate(generatePassword(opts));
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

  return (
    <div className="pwg" role="region" aria-label="패스워드 생성기">
      {/* 길이 슬라이더 */}
      <div className="pwg__lenRow">
        <label className="pwg__lenLabel" htmlFor="pwg-len">
          <span>길이</span>
          <span className="pwg__lenValue">{opts.length}</span>
        </label>
        <input
          id="pwg-len"
          type="range"
          className="pwg__slider"
          min={LENGTH_MIN}
          max={LENGTH_MAX}
          value={opts.length}
          onChange={(e) => setOpts((c) => ({ ...c, length: Number(e.target.value) }))}
        />
      </div>

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
        <span>유사 문자 제외 <em className="pwg__checkHint">(i · l · 1 · o · 0)</em></span>
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
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14 3 14 7 10 7" />
      <path d="M14 7A6 6 0 1 0 13 13" />
    </svg>
  );
}
