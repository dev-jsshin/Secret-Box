/**
 * RFC 6238 TOTP — 표준 알고리즘. Google Authenticator / Microsoft Authenticator /
 * Authy / 1Password / Bitwarden 등 모든 표준 클라이언트와 호환된다 (같은 secret이면
 * 동일 시점에 같은 코드가 나옴).
 *
 * 흐름:
 *   secret(base32) → bytes
 *   counter = floor(unix초 / period)            // 8바이트 big-endian
 *   HMAC-SHA1(key=secretBytes, msg=counterBytes)
 *   dynamic truncation → digits 자릿수 정수 → 0-padded
 *
 * 대부분의 서비스가 SHA1 + 30s + 6자리를 사용 (Google/GitHub/AWS 등). 다른 알고리즘
 * 옵션(SHA256/512)은 의도적으로 미지원 — 호환성 vs 단순성 트레이드오프에서 단순성 선택.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class TotpError extends Error {}

export function isValidBase32(secret: string): boolean {
  const cleaned = secret.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (cleaned.length === 0) return false;
  for (const ch of cleaned) {
    if (!BASE32_ALPHABET.includes(ch)) return false;
  }
  return true;
}

function base32Decode(input: string): Uint8Array {
  // 정규화: 대문자 + 공백/하이픈 제거 + 패딩 제거
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (cleaned.length === 0) throw new TotpError('빈 secret');

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new TotpError(`잘못된 base32 문자: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    // TS 5.7+ 에서 Uint8Array가 generic이 되며 WebCrypto 파라미터가 ArrayBuffer로
    // 좁혀진 ArrayBufferView만 허용 → BufferSource로 명시 캐스트
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(sig);
}

export interface TotpOptions {
  period?: number;     // 기본 30
  digits?: number;     // 기본 6
  timestamp?: number;  // unix초 (테스트용 override; 기본 Date.now()/1000)
}

export async function generateTotp(secret: string, options: TotpOptions = {}): Promise<string> {
  const period = options.period ?? 30;
  const digits = options.digits ?? 6;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);

  const counter = Math.floor(timestamp / period);

  // 8-byte big-endian counter
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, BigInt(counter), false);

  const key = base32Decode(secret);
  const hmac = await hmacSha1(key, counterBytes);

  // RFC 4226 dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);

  const otp = code % (10 ** digits);
  return otp.toString().padStart(digits, '0');
}

export function secondsRemaining(period: number = 30, timestamp?: number): number {
  const now = timestamp ?? Math.floor(Date.now() / 1000);
  return period - (now % period);
}

/**
 * otpauth:// URI 파싱 (QR 코드 안에 들어있는 형태).
 * 예: otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&period=30&digits=6
 */
export interface OtpAuthParts {
  secret: string;
  issuer?: string;
  account?: string;
  period?: number;
  digits?: number;
}

export function parseOtpAuthUri(uri: string): OtpAuthParts | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'otpauth:') return null;
    if (url.host !== 'totp') return null; // hotp는 미지원
    const secret = url.searchParams.get('secret');
    if (!secret) return null;

    // path = "/Issuer:account" 또는 "/account"
    const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const colonIdx = path.indexOf(':');
    const pathIssuer = colonIdx > 0 ? path.substring(0, colonIdx) : undefined;
    const account = colonIdx > 0 ? path.substring(colonIdx + 1) : path;

    const queryIssuer = url.searchParams.get('issuer') ?? undefined;
    const periodStr = url.searchParams.get('period');
    const digitsStr = url.searchParams.get('digits');

    return {
      secret,
      issuer: queryIssuer ?? pathIssuer,
      account: account || undefined,
      period: periodStr ? Number(periodStr) : undefined,
      digits: digitsStr ? Number(digitsStr) : undefined,
    };
  } catch {
    return null;
  }
}
