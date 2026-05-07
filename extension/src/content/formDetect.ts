// 페이지에서 로그인 폼을 찾는다. "1패스 풀세트"가 목표가 아니라 흔한 패턴 90% 커버가 목표.
//
// 우선순위:
//   1. <input type="password">를 모두 찾음
//   2. 각 password input에 대해 짝이 될 username 후보를 다음 순서로 탐색:
//      a. 같은 form 안의 input[autocomplete="username" | "email"]
//      b. 같은 form 안의 input[type="email"]
//      c. 같은 form 안에서 password 위쪽에 위치한 text/email input
//      d. (form 없으면) DOM 트리에서 가장 가까운 text/email input
//   3. visible / enabled / 표시 가능한 것만
//
// "matchedHost" 판단은 background가 LIST_ITEMS로 줄 때 이미 처리.

export interface DetectedForm {
  /** 안정적 식별 — 같은 페이지에서 다시 찾을 때 */
  formId: string;
  passwordEl: HTMLInputElement;
  usernameEl: HTMLInputElement | null;
}

let formCounter = 0;

export function detectForms(): DetectedForm[] {
  const passwordInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  ).filter(isUsable);

  const out: DetectedForm[] = [];
  for (const pwd of passwordInputs) {
    const username = findUsernameFor(pwd);
    out.push({
      formId: ensureMarked(pwd, 'pwd', `sb-form-${++formCounter}`),
      passwordEl: pwd,
      usernameEl: username,
    });
  }
  return out;
}

function isUsable(el: HTMLInputElement): boolean {
  if (el.disabled || el.readOnly) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
  // 화면 밖이거나 0px인 거 제외
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  return true;
}

function findUsernameFor(password: HTMLInputElement): HTMLInputElement | null {
  const form = password.form;
  const scope: ParentNode = form ?? document;

  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[autocomplete*="username"], input[autocomplete*="email"], input[type="email"], input[type="text"], input:not([type])',
    ),
  ).filter((el) => isUsable(el) && el !== password);

  if (candidates.length === 0) return null;

  // 1) autocomplete username/email 우선
  const byAuto = candidates.find((el) => /username|email/i.test(el.autocomplete ?? ''));
  if (byAuto) return byAuto;

  // 2) type=email
  const byType = candidates.find((el) => el.type === 'email');
  if (byType) return byType;

  // 3) password 위쪽에 위치 + 가장 가까운 (DOM 순회 기준)
  const pwdRect = password.getBoundingClientRect();
  const above = candidates.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= pwdRect.top + 4; // 4px 여유
  });
  if (above.length > 0) {
    above.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.abs(pwdRect.top - ar.bottom) - Math.abs(pwdRect.top - br.bottom);
    });
    return above[0];
  }

  // 4) 같은 컨테이너 형제만 — 너무 멀리 있는 건 매칭 안 함
  return null;
}

function ensureMarked(el: HTMLElement, role: 'pwd' | 'user', id: string): string {
  const existing = el.getAttribute('data-sb-id');
  if (existing) return existing;
  el.setAttribute('data-sb-id', id);
  el.setAttribute('data-sb-role', role);
  return id;
}
