/**
 * SecretBox 보관함 백업/복원.
 *
 * 보안 모델:
 *   - 백업 파일에는 항상 암호화된 ciphertext만 들어간다 (서버에 저장된 것과 동일).
 *   - 복원 시 파일에 포함된 KDF params + 그 시점의 master password로 KEK를 다시 파생,
 *     protectedDek을 풀어 DEK 복구 → 항목들 복호화 가능.
 *   - 결과적으로 백업 파일 단독으로는 절대 풀 수 없고, 마스터 비번이 필요하다.
 *
 * 포맷 v1:
 *   {
 *     "format": "secretbox-vault-export",
 *     "version": 1,
 *     "exportedAt": "2026-04-29T...",
 *     "email": "user@example.com",
 *     "kdf": { algorithm, iterations, memoryKb, parallelism, saltBase64 },
 *     "protectedDek": { ciphertextBase64, ivBase64 },
 *     "items": [{ itemType, encryptedData, encryptedIv, createdAt, updatedAt, version }]
 *   }
 */

import { bytesToBase64, base64ToBytes } from '../crypto/base64';
import { decryptJson, encryptJson } from '../crypto/cipher';
import { deriveKek } from '../crypto/kdf';
import { decrypt as aesDecrypt } from '../crypto/cipher';
import type { KdfParams, UnlockMaterial } from '../store/session';
import type { VaultItemDto } from '../api/vault';
import type { VaultItemPlaintext } from '../types/vault';

export const BACKUP_FORMAT = 'secretbox-vault-export';
export const BACKUP_VERSION = 1;

interface KdfBlock {
  algorithm: 'argon2id';
  iterations: number;
  memoryKb: number;
  parallelism: number;
  saltBase64: string;
}

interface ProtectedDekBlock {
  ciphertextBase64: string;
  ivBase64: string;
}

interface ExportedItem {
  itemType: string;
  encryptedData: string;
  encryptedIv: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  email: string;
  kdf: KdfBlock;
  protectedDek: ProtectedDekBlock;
  items: ExportedItem[];
}

/**
 * 현재 세션 정보 + 서버 항목 목록으로 백업 객체를 만든다.
 * 평문 변환 일체 없음 — 서버에서 받은 ciphertext를 그대로 묶어 출력한다.
 */
export function buildBackup(
  email: string,
  unlock: UnlockMaterial,
  items: VaultItemDto[],
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    email,
    kdf: {
      algorithm: 'argon2id',
      iterations: unlock.kdfParams.iterations,
      memoryKb: unlock.kdfParams.memoryKb,
      parallelism: unlock.kdfParams.parallelism,
      saltBase64: bytesToBase64(unlock.kdfSalt),
    },
    protectedDek: {
      ciphertextBase64: bytesToBase64(unlock.protectedDek),
      ivBase64: bytesToBase64(unlock.protectedDekIv),
    },
    items: items.map((i) => ({
      itemType: i.itemType,
      encryptedData: i.encryptedData,
      encryptedIv: i.encryptedIv,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      version: i.version,
    })),
  };
}

/** 다운로드 트리거 — 브라우저가 파일로 저장하게 한다. */
export function triggerDownload(backup: BackupFile) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = makeFilename(backup.email);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeFilename(email: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const sanitizedEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `secretbox-${sanitizedEmail}-${date}.json`;
}

/** 파일에서 읽은 JSON을 파싱·검증해 BackupFile로 반환. */
export function parseBackup(raw: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('파일이 올바른 JSON이 아닙니다.');
  }
  if (!isBackupFile(json)) {
    throw new Error('SecretBox 백업 파일 형식이 아닙니다.');
  }
  if (json.version !== BACKUP_VERSION) {
    throw new Error(`지원하지 않는 백업 버전: ${json.version}`);
  }
  return json;
}

function isBackupFile(x: unknown): x is BackupFile {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.format === BACKUP_FORMAT &&
    typeof o.version === 'number' &&
    typeof o.email === 'string' &&
    !!o.kdf && typeof o.kdf === 'object' &&
    !!o.protectedDek && typeof o.protectedDek === 'object' &&
    Array.isArray(o.items)
  );
}

/**
 * 백업 파일 + 마스터 비번으로 모든 항목을 복호화하여 평문 배열을 반환.
 * 서버에 다시 올리기 전 단계 — 호출자가 현재 세션 DEK로 재암호화 + POST 한다.
 */
export interface DecryptedBackupItem {
  itemType: string;
  plaintext: VaultItemPlaintext;
}

export async function decryptBackup(
  backup: BackupFile,
  masterPassword: string,
): Promise<DecryptedBackupItem[]> {
  // 1) KEK 재파생
  const kdfParams: KdfParams & { salt: Uint8Array } = {
    iterations: backup.kdf.iterations,
    memoryKb: backup.kdf.memoryKb,
    parallelism: backup.kdf.parallelism,
    salt: base64ToBytes(backup.kdf.saltBase64),
  };
  const kek = await deriveKek(masterPassword, kdfParams);

  // 2) protectedDek → DEK
  let dek: Uint8Array;
  try {
    dek = await aesDecrypt(
      kek,
      base64ToBytes(backup.protectedDek.ciphertextBase64),
      base64ToBytes(backup.protectedDek.ivBase64),
    );
  } catch {
    throw new Error('비밀번호가 다르거나 백업 파일이 손상되었습니다.');
  }

  // 3) 각 항목 복호화
  const out: DecryptedBackupItem[] = [];
  for (const item of backup.items) {
    try {
      const plaintext = await decryptJson<VaultItemPlaintext>(
        dek,
        base64ToBytes(item.encryptedData),
        base64ToBytes(item.encryptedIv),
      );
      out.push({ itemType: item.itemType, plaintext });
    } catch {
      // 깨진 한 항목은 건너뛰고 계속 (전체 복원이 망하지 않게)
      // 호출자에서 복원된 개수와 실패 개수를 비교해 알림 가능
    }
  }
  return out;
}

/**
 * 평문 항목을 현재 세션의 DEK로 재암호화 → 서버로 보낼 body 형태로 반환.
 */
export async function reencryptForCurrentSession(
  decrypted: DecryptedBackupItem,
  currentDek: Uint8Array,
): Promise<{ itemType: string; encryptedData: string; encryptedIv: string }> {
  const { ciphertext, iv } = await encryptJson(currentDek, decrypted.plaintext);
  return {
    itemType: decrypted.itemType,
    encryptedData: bytesToBase64(ciphertext),
    encryptedIv: bytesToBase64(iv),
  };
}
