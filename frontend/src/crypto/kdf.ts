import { argon2id } from 'hash-wasm';

export interface KdfParams {
  salt: Uint8Array;
  iterations: number;
  memoryKb: number;
  parallelism: number;
}

export const DEFAULT_KDF_PARAMS: Omit<KdfParams, 'salt'> = {
  iterations: 3,
  memoryKb: 65536,
  parallelism: 4,
};

/**
 * 마스터 패스워드로부터 KEK(Key Encryption Key)를 파생한다.
 * 이 키는 절대 서버로 전송하지 않는다. DEK를 감싸는 용도.
 */
export async function deriveKek(password: string, params: KdfParams): Promise<Uint8Array> {
  const hashHex = await argon2id({
    password,
    salt: params.salt,
    iterations: params.iterations,
    memorySize: params.memoryKb,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'hex',
  });
  return hexToBytes(hashHex);
}

/**
 * 서버로 보낼 authHash를 파생한다.
 * KEK에서 한 번 더 단방향 유도 → 서버가 이 값을 받아도 KEK를 역산할 수 없다.
 */
export async function deriveAuthHash(kek: Uint8Array, password: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    kek as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(password) as BufferSource);
  return new Uint8Array(sig);
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
