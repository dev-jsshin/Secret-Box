import { encrypt, decrypt } from './cipher';
import { deriveKek, randomBytes, type KdfParams } from './kdf';

/**
 * 신규 가입 시 호출:
 *   1) 랜덤 DEK 생성
 *   2) 마스터 패스워드 → KEK 파생
 *   3) KEK로 DEK 암호화 → 서버 저장용 blob
 */
export async function createAndProtectDek(password: string, params: KdfParams) {
  const dek = randomBytes(32);
  const kek = await deriveKek(password, params);
  const { ciphertext, iv } = await encrypt(kek, dek);
  return { dek, protectedDek: ciphertext, protectedDekIv: iv };
}

/**
 * 로그인 완료 후 서버로부터 받은 protectedDek을 풀어 DEK를 복구한다.
 * DEK는 메모리에만 보관 (localStorage 저장 금지).
 */
export async function unlockDek(
  password: string,
  params: KdfParams,
  protectedDek: Uint8Array,
  protectedDekIv: Uint8Array
): Promise<Uint8Array> {
  const kek = await deriveKek(password, params);
  return decrypt(kek, protectedDek, protectedDekIv);
}
