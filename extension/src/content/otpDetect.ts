// 2FA / OTP input 감지. password input과 달리 별도 페이지로 넘어가는 경우가 많고
// type=password가 아니어서 별도 휴리스틱 필요.
//
// 우선순위:
//   1. autocomplete="one-time-code" (최근 표준 — 가장 정확. iOS Safari 자동 SMS도 이걸로)
//   2. inputmode="numeric" + maxlength=6 + (name|id|placeholder가 otp/totp/code/2fa 중 하나)
//   3. type="tel"|"text" + maxlength 4~8 + name/id에 otp/totp/code/2fa
//
// 분할 입력(6개 박스 1자리씩)은 후속 — 흔하지만 사이트마다 인덱싱 방식이 달라 복잡.

export interface DetectedOtp {
  el: HTMLInputElement;
  /** 이 input이 속한 form (자동 submit 시 필요) */
  form: HTMLFormElement | null;
}

// 'mfa' 추가 (AWS, Atlassian 등), 'pin' 일부 사이트
const NAME_PATTERNS = /\b(otp|totp|2fa|tfa|mfa|two[-_]?factor|multi[-_]?factor|verification|verify|auth(?:-?code)?|one[-_]?time|pin)\b/i;

export function detectOtp(): DetectedOtp | null {
  // 1) autocomplete one-time-code — 최우선
  const byAuto = document.querySelector<HTMLInputElement>('input[autocomplete*="one-time-code"]');
  if (byAuto && isUsable(byAuto)) {
    return { el: byAuto, form: byAuto.form };
  }

  // 2/3) name/id/placeholder + 입력 형태로 추론
  const candidates = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="tel"], input[type="number"], input:not([type])'),
  ).filter(isUsable);

  // name/id/placeholder/aria-label에 OTP 패턴 잡히면 다른 시그널 없어도 OTP로 본다.
  // AWS의 mfaCode처럼 maxlength도 inputmode도 안 줘도 name으로 100% 의도가 드러남.
  for (const el of candidates) {
    const tokens = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`;
    if (NAME_PATTERNS.test(tokens)) {
      return { el, form: el.form };
    }
  }

  // name 단서가 전혀 없는 사이트 폴백 — numeric 6자리 input 1개만 떠있으면 OTP일 가능성 높음
  const numericShort = candidates.filter((el) => {
    const len = el.maxLength;
    const isShort = len > 0 && len >= 4 && len <= 9;
    const isNumeric = el.inputMode === 'numeric' || el.type === 'number' || el.type === 'tel';
    return isShort && isNumeric;
  });
  if (numericShort.length === 1) {
    return { el: numericShort[0], form: numericShort[0].form };
  }

  return null;
}

function isUsable(el: HTMLInputElement): boolean {
  if (el.disabled || el.readOnly) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  return true;
}

/** 폼 안에서 submit 버튼을 찾아 클릭 — type=submit 우선, 없으면 첫 button */
export function trySubmit(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  const submitBtn = form.querySelector<HTMLButtonElement | HTMLInputElement>(
    'button[type="submit"], input[type="submit"]',
  );
  if (submitBtn) {
    submitBtn.click();
    return true;
  }
  // type 명시 안 된 button은 기본이 submit이라 form 안의 첫 button 시도
  const fallback = form.querySelector<HTMLButtonElement>('button:not([type="button"])');
  if (fallback) {
    fallback.click();
    return true;
  }
  return false;
}
