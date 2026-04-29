import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import FormField from './FormField';
import Button from './Button';
import AlertModal from './AlertModal';
import Modal from './Modal';

import { vaultApi } from '../api/vault';
import { ApiError } from '../api/client';
import { useSessionStore } from '../store/session';
import {
  buildBackup,
  decryptBackup,
  parseBackup,
  reencryptForCurrentSession,
  triggerDownload,
  type BackupFile,
} from '../lib/backup';

import './BackupCard.css';

interface ImportPrompt {
  backup: BackupFile;
  fileName: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * 보관함 백업/복원 카드.
 * - 내보내기: 서버 항목 + 세션의 protectedDek/KDF params를 묶어 JSON 다운로드
 * - 가져오기: 백업 파일 + 그 시점 마스터 비번 입력 → 항목 복호화 → 현재 세션 DEK로
 *             재암호화하여 서버에 일괄 등록 (중복 제거 X — 사용자 안내)
 */
export default function BackupCard() {
  const queryClient = useQueryClient();
  const dek = useSessionStore((s) => s.dek);
  const email = useSessionStore((s) => s.email);
  const unlock = useSessionStore((s) => s.unlockMaterial);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPrompt, setImportPrompt] = useState<ImportPrompt | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ---------- 내보내기 ----------
  async function handleExport() {
    if (!unlock || !email) {
      setError('세션 정보를 불러올 수 없습니다.');
      return;
    }
    setExporting(true);
    try {
      const { items } = await vaultApi.list();
      const backup = buildBackup(email, unlock, items);
      triggerDownload(backup);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '백업 파일 생성에 실패했습니다.';
      setError(msg);
    } finally {
      setExporting(false);
    }
  }

  // ---------- 가져오기: 파일 선택 ----------
  function handlePickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';   // 같은 파일 다시 선택 가능하게 reset
    if (!file) return;
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      setImportPrompt({ backup, fileName: file.name });
      setImportPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 읽을 수 없습니다.');
    }
  }

  // ---------- 가져오기: 비번 확인 후 실제 복원 ----------
  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      if (!importPrompt || !dek) throw new Error('SESSION');
      const decrypted = await decryptBackup(importPrompt.backup, importPassword);
      const total = importPrompt.backup.items.length;
      const decryptedCount = decrypted.length;

      let imported = 0;
      for (const item of decrypted) {
        try {
          const body = await reencryptForCurrentSession(item, dek);
          await vaultApi.create(body);
          imported++;
        } catch {
          // 한 항목 실패해도 다음 진행
        }
      }
      return { imported, skipped: total - decryptedCount + (decryptedCount - imported) };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vault-items'] });
      queryClient.invalidateQueries({ queryKey: ['vault-counts'] });
      setImportPrompt(null);
      setImportPassword('');
      setImportResult(result);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : '복원에 실패했습니다.';
      setError(msg);
    },
  });

  return (
    <section className="settings__card rise delay-3">
      <h2 className="settings__cardTitle">보관함 백업</h2>

      <p className="bk__lede">
        모든 항목을 <strong>암호화된 채로</strong> JSON 파일로 내려받거나, 다른 환경에서
        만든 백업 파일을 가져옵니다. 파일은 그 시점 마스터 비밀번호가 있어야만 풀립니다.
      </p>

      <div className="bk__row">
        <div className="bk__col">
          <div className="bk__label">내보내기</div>
          <div className="bk__hint">
            서버에 저장된 모든 항목 + 키 파생 정보를 묶어 다운로드합니다.
            파일 자체는 평문이 아니므로 USB, 클라우드 어디든 보관 가능.
          </div>
          <button
            type="button"
            className="bk__btn"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '내보내는 중…' : '↓ 백업 파일 다운로드'}
          </button>
        </div>

        <div className="bk__divider" aria-hidden />

        <div className="bk__col">
          <div className="bk__label">가져오기</div>
          <div className="bk__hint">
            백업 파일과 그 시점 마스터 비밀번호로 모든 항목을 복호화 후 현재 보관함에
            추가합니다. <strong>중복 제거는 하지 않으니</strong> 같은 파일을 두 번 가져오면
            항목이 두 번 들어갑니다.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="bk__fileHidden"
            aria-hidden
          />
          <button type="button" className="bk__btn" onClick={handlePickFile}>
            ↑ 백업 파일 가져오기
          </button>
        </div>
      </div>

      {/* 가져오기 비번 확인 모달 */}
      <Modal
        isOpen={!!importPrompt}
        onClose={() => {
          setImportPrompt(null);
          setImportPassword('');
        }}
        title="백업 파일 복원"
      >
        {importPrompt && (
          <form
            className="bk__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!importPassword) {
                setError('비밀번호를 입력해주세요.');
                return;
              }
              importMutation.mutate();
            }}
            noValidate
          >
            <h3 className="bk__formTitle">{importPrompt.fileName}</h3>
            <dl className="bk__rows">
              <div className="bk__formRow">
                <dt>이메일</dt>
                <dd>{importPrompt.backup.email}</dd>
              </div>
              <div className="bk__formRow">
                <dt>내보낸 시점</dt>
                <dd>{formatExportedAt(importPrompt.backup.exportedAt)}</dd>
              </div>
              <div className="bk__formRow">
                <dt>항목 수</dt>
                <dd>{importPrompt.backup.items.length}개</dd>
              </div>
            </dl>

            <FormField
              id="bk-import-password"
              type="password"
              label="이 파일을 만들 때 사용한 마스터 비밀번호"
              placeholder="••••••••"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              autoFocus
              hint="이메일이 다르더라도, 그 시점 비밀번호로 복호화합니다."
            />

            <div className="bk__formActions">
              <button
                type="button"
                className="bk__cancel"
                onClick={() => {
                  setImportPrompt(null);
                  setImportPassword('');
                }}
                disabled={importMutation.isPending}
              >
                취소
              </button>
              <Button
                type="submit"
                loading={importMutation.isPending}
                loadingLabel="복호화·등록 중…"
              >
                복원 시작
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 결과 알림 */}
      <AlertModal
        isOpen={!!importResult}
        onClose={() => setImportResult(null)}
        variant="info"
        title="복원 완료"
        message={
          importResult
            ? `${importResult.imported}개 항목을 복원했습니다.${
                importResult.skipped > 0
                  ? `\n${importResult.skipped}개는 복호화/등록에 실패해 건너뛰었습니다.`
                  : ''
              }`
            : undefined
        }
      />

      <AlertModal
        isOpen={!!error}
        onClose={() => setError(null)}
        variant="error"
        title="오류"
        message={error ?? undefined}
      />
    </section>
  );
}

function formatExportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
