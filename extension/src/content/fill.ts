// input 값을 채우면서 React/Vue 같은 controlled-input 프레임워크가 변화를 감지하도록
// "native value setter" + InputEvent를 직접 발사한다.
//
// 단순히 input.value = '...' + dispatchEvent('input')만 해선 React가 무시하는 케이스가 있음
// (React 16+ 의 SyntheticEvent 추적이 native setter 호출을 신뢰함). HTMLInputElement의
// prototype에서 setter를 꺼내 input 인스턴스에 적용해야 React가 해당 변경을 컴포넌트 state로
// 반영한다.

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
)?.set;

const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value',
)?.set;

export function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = el instanceof HTMLTextAreaElement
    ? nativeTextareaValueSetter
    : nativeInputValueSetter;
  if (setter) setter.call(el, value);
  else el.value = value;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function fillForm(opts: {
  username?: string;
  password?: string;
  passwordEl?: HTMLInputElement | null;
  usernameEl?: HTMLInputElement | null;
}) {
  if (opts.usernameEl && opts.username !== undefined) {
    opts.usernameEl.focus();
    setFieldValue(opts.usernameEl, opts.username);
  }
  if (opts.passwordEl && opts.password !== undefined) {
    opts.passwordEl.focus();
    setFieldValue(opts.passwordEl, opts.password);
  }
}
