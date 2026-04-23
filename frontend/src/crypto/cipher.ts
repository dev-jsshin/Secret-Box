import { randomBytes } from './kdf';

export interface EncryptedBlob {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

/**
 * AES-256-GCM 암호화. DEK 또는 KEK를 raw 바이트로 받아 사용한다.
 */
export async function encrypt(key: Uint8Array, plaintext: Uint8Array): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);
  return { ciphertext: new Uint8Array(ct), iv };
}

export async function decrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new Uint8Array(pt);
}

export async function encryptJson(key: Uint8Array, obj: unknown): Promise<EncryptedBlob> {
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  return encrypt(key, plaintext);
}

export async function decryptJson<T>(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<T> {
  const pt = await decrypt(key, ciphertext, iv);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
