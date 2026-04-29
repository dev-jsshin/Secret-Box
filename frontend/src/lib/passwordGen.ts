/**
 * 보안 랜덤 패스워드 생성기.
 * crypto.getRandomValues + 거부 표본추출(rejection sampling)로 모듈로 편향 없이
 * 균등 분포의 인덱스를 뽑는다.
 */

export interface GenerateOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;   // i/I/l/L/1, o/O/0 등 시각적으로 헷갈리는 글자 제외
}

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
};

export const LENGTH_MIN = 8;
export const LENGTH_MAX = 64;

const UPPER_CHARS   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER_CHARS   = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT_CHARS   = '0123456789';
const SYMBOL_CHARS  = '!@#$%^&*()_+-=[]{}|;:,.<>?~';
const AMBIGUOUS     = new Set('iIlL1oO0'.split(''));

/**
 * 옵션에 맞춰 사용 가능한 문자 풀 + 각 카테고리별 풀(최소 1자 포함 보장용) 반환.
 */
function buildPools(opts: GenerateOptions): { all: string[]; required: string[][] } {
  const filter = (s: string) =>
    [...s].filter((c) => !opts.excludeAmbiguous || !AMBIGUOUS.has(c));

  const pools: string[][] = [];
  if (opts.upper) pools.push(filter(UPPER_CHARS));
  if (opts.lower) pools.push(filter(LOWER_CHARS));
  if (opts.digits) pools.push(filter(DIGIT_CHARS));
  if (opts.symbols) pools.push(filter(SYMBOL_CHARS));

  const all = pools.flat();
  return { all, required: pools };
}

/** 거부 표본추출로 [0, n)의 균등 정수를 뽑는다. */
function randomInt(n: number): number {
  if (n <= 0) throw new Error('n must be > 0');
  // 32비트 공간을 n의 배수까지만 받아들임 → 모듈로 편향 0
  const max = Math.floor(0xffffffff / n) * n;
  const buf = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return buf[0] % n;
  }
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

/** Fisher-Yates 셔플 (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 옵션에 따라 패스워드 생성. 활성화한 각 카테고리에서 최소 1자 보장 후
 * 나머지를 전체 풀에서 균등 추출, 마지막에 셔플해 카테고리 위치 노출 방지.
 */
export function generatePassword(opts: GenerateOptions): string {
  const len = Math.max(LENGTH_MIN, Math.min(LENGTH_MAX, Math.floor(opts.length)));
  const { all, required } = buildPools(opts);

  if (all.length === 0) return '';
  if (required.length > len) {
    // 카테고리가 길이보다 많은 극단 케이스 — 전체 풀에서 그냥 len개 뽑기
    return Array.from({ length: len }, () => pick(all)).join('');
  }

  const out: string[] = required.map((pool) => pick(pool));   // 카테고리당 1자 보장
  while (out.length < len) {
    out.push(pick(all));
  }
  return shuffle(out).join('');
}
