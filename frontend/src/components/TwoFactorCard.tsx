import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';

import Modal from './Modal';
import Button from './Button';
import FormField from './FormField';

import {
  usersApi,
  type TwoFactorInitResponse,
} from '../api/users';
import { ApiError } from '../api/client';

import './TwoFactorCard.css';

interface TwoFactorCardProps {
  onError: (msg: string) => void;
}

/**
 * 마스터 로그인용 2FA (TOTP) 카드.
 *   - 비활성: [활성화] 버튼 → init 모달 (secret 표시) → 코드 입력 → recovery codes 표시
 *   - 활성: 상태 표시 + [비활성화] 버튼 → 현재 코드/recovery 입력
 */
export default function TwoFactorCard({ onError }: TwoFactorCardProps) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => usersApi.getTwoFactorStatus(),
  });

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollInit, setEnrollInit] = useState<TwoFactorInitResponse | null>(null);
  const [enrollCode1, setEnrollCode1] = useState('');
  const [enrollCode2, setEnrollCode2] = useState('');
  const [enrollCodeError, setEnrollCodeError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableCodeError, setDisableCodeError] = useState('');

  const [copiedTarget, setCopiedTarget] = useState<'secret' | 'recovery' | null>(null);

  async function handleCopy(target: 'secret' | 'recovery', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setTimeout(() => {
        setCopiedTarget((cur) => (cur === target ? null : cur));
      }, 1500);
    } catch {
      onError('클립보드에 접근할 수 없습니다');
    }
  }

  function handleDownloadRecovery() {
    if (!recoveryCode) return;
    const today = new Date().toISOString().slice(0, 10);
    const content =
      `SecretBox — 2FA Recovery Code\n` +
      `발급일: ${today}\n\n` +
      `Recovery code:\n${recoveryCode}\n\n` +
      `주의:\n` +
      `- 이 코드는 한 번만 사용 가능합니다.\n` +
      `- 사용 시 2FA가 자동 비활성화됩니다.\n` +
      `- 안전한 곳에 보관하세요 (인쇄, 패스워드 매니저 등).\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secretbox-recovery-${today}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const initMutation = useMutation({
    mutationFn: () => usersApi.initTwoFactor(),
    onSuccess: (data) => setEnrollInit(data),
    onError: (e) => onError(e instanceof ApiError ? e.message : '2FA 등록 시작 실패'),
  });

  const confirmMutation = useMutation({
    mutationFn: ({ c1, c2 }: { c1: string; c2: string }) =>
      usersApi.confirmTwoFactor(c1, c2),
    onSuccess: (data) => {
      setRecoveryCode(data.recoveryCode);
      setEnrollCode1('');
      setEnrollCode2('');
      setEnrollCodeError('');
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_TOTP_CODE') {
        setEnrollCodeError('두 코드가 일치하지 않거나 연속이 아닙니다. 첫 번째 코드 후 약 30초 기다렸다가 새 코드를 입력하세요');
        return;
      }
      onError(e instanceof ApiError ? e.message : '확인 실패');
    },
  });

  const disableMutation = useMutation({
    mutationFn: (code: string) => usersApi.disableTwoFactor(code),
    onSuccess: () => {
      setDisableOpen(false);
      setDisableCode('');
      setDisableCodeError('');
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_TOTP_CODE') {
        setDisableCodeError('코드가 올바르지 않습니다');
        return;
      }
      onError(e instanceof ApiError ? e.message : '비활성화 실패');
    },
  });

  function handleStartEnroll() {
    setEnrollOpen(true);
    setEnrollInit(null);
    setEnrollCode1('');
    setEnrollCode2('');
    setEnrollCodeError('');
    setRecoveryCode(null);
    initMutation.mutate();
  }

  function handleEnrollSubmit(e: FormEvent) {
    e.preventDefault();
    const c1 = enrollCode1.trim();
    const c2 = enrollCode2.trim();
    if (!c1 || !c2) {
      setEnrollCodeError('두 코드를 모두 입력해주세요');
      return;
    }
    setEnrollCodeError('');
    confirmMutation.mutate({ c1, c2 });
  }

  function handleEnrollClose() {
    setEnrollOpen(false);
    setEnrollInit(null);
    setEnrollCode1('');
    setEnrollCode2('');
    setEnrollCodeError('');
    setRecoveryCode(null);
  }

  function handleDisableSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = disableCode.trim();
    if (!trimmed) {
      setDisableCodeError('코드를 입력해주세요');
      return;
    }
    setDisableCodeError('');
    disableMutation.mutate(trimmed);
  }


  const enabled = statusQuery.data?.enabled ?? false;

  return (
    <>
      <section className="settings__card rise delay-3">
        <h2 className="settings__cardTitle">로그인 2단계 인증</h2>

        {statusQuery.isPending ? (
          <p className="tfc__line">상태 확인 중…</p>
        ) : (
          <>
            <div className="tfc__status">
              <span className={'tfc__statusDot ' + (enabled ? 'is-on' : 'is-off')} />
              <div className="tfc__statusBody">
                <div className="tfc__statusTitle">
                  {enabled ? '활성화됨' : '비활성 — 보호 안 됨'}
                </div>
                <div className="tfc__statusDesc">
                  {enabled
                    ? 'authenticator 6자리 코드 또는 recovery code로 보호 중'
                    : '마스터 비밀번호 외 추가 요소 없음. 비밀번호 누설 시 노출 위험'}
                </div>
              </div>
            </div>

            <p className="tfc__explainer">
              authenticator 앱(Google/MS Authenticator 등)이 30초마다 새 6자리 코드를
              만들고, 로그인 시 비밀번호와 함께 그 코드를 요구합니다. 비밀번호가 털려도
              코드 없이는 들어올 수 없어요.
            </p>

            {!enabled && (
              <button
                type="button"
                className="tfc__btn tfc__btn--primary"
                onClick={handleStartEnroll}
              >
                2FA 활성화
              </button>
            )}

            {enabled && (
              <div className="tfc__dangerZone">
                <div className="tfc__dangerLabel">위험구역</div>
                <button
                  type="button"
                  className="tfc__btn tfc__btn--danger"
                  onClick={() => {
                    setDisableOpen(true);
                    setDisableCode('');
                    setDisableCodeError('');
                  }}
                >
                  2FA 비활성화
                </button>
              </div>
            )}
          </>
        )}

      </section>

      {/* Enrollment 모달 — 3단계: secret 표시 → 코드 확인 → recovery 표시 */}
      <Modal
        isOpen={enrollOpen}
        onClose={handleEnrollClose}
        title={recoveryCode ? '2FA 활성화 완료' : '2FA 활성화'}
      >
        {recoveryCode ? (
          <div className="tfc__panel">
            <div className="tfc__hero">
              <div className="tfc__heroIcon"><CheckIcon /></div>
              <div>
                <div className="tfc__heroTitle">2FA가 활성화되었습니다</div>
                <div className="tfc__heroSub">
                  아래 recovery code를 지금 저장하세요. 다시는 표시되지 않습니다.
                </div>
              </div>
            </div>

            <div className="tfc__recoveryBox">
              <div className="tfc__recoveryLabel">RECOVERY CODE</div>
              <code className="tfc__recoveryCode">{formatRecovery(recoveryCode)}</code>
            </div>

            <div className="tfc__recoveryActions">
              <button
                type="button"
                className={
                  'tfc__chip' + (copiedTarget === 'recovery' ? ' is-copied' : '')
                }
                onClick={() => handleCopy('recovery', recoveryCode)}
              >
                {copiedTarget === 'recovery' ? <CheckSmallIcon /> : <CopySmallIcon />}
                {copiedTarget === 'recovery' ? '복사됨' : '복사'}
              </button>
              <button
                type="button"
                className="tfc__chip"
                onClick={handleDownloadRecovery}
              >
                <DownloadSmallIcon />
                .txt로 저장
              </button>
            </div>

            <div className="tfc__noticeWarn">
              사용 즉시 2FA가 자동 비활성화됩니다 (kill switch).
              그 후엔 다시 활성화해서 새 코드를 받아야 해요.
            </div>

            <div className="tfc__panelActions">
              <Button onClick={handleEnrollClose}>저장 완료</Button>
            </div>
          </div>
        ) : enrollInit ? (
          <form className="tfc__panel" onSubmit={handleEnrollSubmit} noValidate>
            <p className="tfc__panelLede">
              authenticator 앱(Google/MS Authenticator 등)으로 아래 QR을 스캔하거나,
              <strong> 수동 입력</strong>에 secret을 직접 넣어 등록하세요.
            </p>

            <div className="tfc__qrBox">
              <div className="tfc__qrFrame">
                <QRCode
                  value={enrollInit.otpauthUri}
                  size={168}
                  bgColor="#FFFFFF"
                  fgColor="#0A0E1A"
                  level="M"
                />
              </div>
            </div>

            <div className="tfc__secretBox">
              <span className="tfc__secretLabel">Secret</span>
              <code className="tfc__secret">{enrollInit.secret}</code>
              <button
                type="button"
                className={
                  'tfc__copyBtn' + (copiedTarget === 'secret' ? ' tfc__copyBtn--copied' : '')
                }
                onClick={() => handleCopy('secret', enrollInit.secret)}
              >
                {copiedTarget === 'secret' ? '복사됨 ✓' : '복사'}
              </button>
            </div>

            <p className="tfc__panelLede">
              authenticator에 등록되면, 거기서 보이는 <strong>두 연속 코드</strong>를 순서대로 입력해주세요.
              <br />
              두 번째는 30초 후 새로 갱신될 코드입니다.
            </p>

            <div className="tfc__codePair">
              <FormField
                id="tfc-code-1"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                label="첫 번째 코드"
                placeholder="000000"
                value={enrollCode1}
                onChange={(e) => setEnrollCode1(e.target.value)}
              />
              <FormField
                id="tfc-code-2"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                label="두 번째 코드"
                placeholder="000000"
                value={enrollCode2}
                onChange={(e) => setEnrollCode2(e.target.value)}
                error={enrollCodeError}
              />
            </div>

            <div className="tfc__panelActions">
              <button type="button" className="tfc__btn" onClick={handleEnrollClose}>
                취소
              </button>
              <Button
                type="submit"
                loading={confirmMutation.isPending}
                loadingLabel="확인 중…"
              >
                확인 및 활성화
              </Button>
            </div>
          </form>
        ) : (
          <p className="tfc__line">secret 생성 중…</p>
        )}
      </Modal>

      {/* Disable 모달 */}
      <Modal
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="2FA 비활성화"
      >
        <form className="tfc__panel" onSubmit={handleDisableSubmit} noValidate>
          <p className="tfc__panelLede">
            현재 6자리 코드 또는 recovery code를 입력하세요.
            확인되면 2FA 자료가 모두 삭제됩니다.
          </p>
          <FormField
            id="tfc-disable-code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            label="코드"
            placeholder="6자리 TOTP 또는 복구 코드 32자"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            error={disableCodeError}
          />
          <div className="tfc__panelActions">
            <button
              type="button"
              className="tfc__btn"
              onClick={() => setDisableOpen(false)}
            >
              취소
            </button>
            <Button
              type="submit"
              loading={disableMutation.isPending}
              loadingLabel="확인 중…"
            >
              비활성화
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopySmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function DownloadSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** 32자 recovery를 4자씩 8그룹으로 — 시각 그룹화. 클립보드 복사할 땐 원본 그대로. */
function formatRecovery(code: string): string {
  if (!code) return '';
  return code.match(/.{1,4}/g)?.join(' ') ?? code;
}
