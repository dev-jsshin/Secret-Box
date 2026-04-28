import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usersApi, type AuditLogEntry } from '../api/users';

import './ActivityCard.css';

/**
 * 본인 활동 로그 카드 — Settings의 "활동" 탭에 들어감.
 * 시간 역순으로 N개씩 페이지네이션. 각 줄에 액션 라벨/시각/IP/기기 정보.
 *
 * 의도된 비용 절감:
 *   - 페이지당 30개, 더 보기 버튼으로 다음 페이지 (무한 스크롤 X — 사용자가 의도적으로 누름)
 *   - 보안 관련 액션은 색/아이콘으로 강조
 */
export default function ActivityCard() {
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['user-activity', page],
    queryFn: () => usersApi.getActivity(page, 30),
    placeholderData: (prev) => prev,
  });

  return (
    <section className="settings__card rise delay-3">
      <h2 className="settings__cardTitle">활동 내역</h2>
      <div className="settings__notice">
        <ClockIcon />
        <span>
          최근 인증·세션·항목 변경 내역. 의심스러운 항목이 보이면 비밀번호를 바꾸고
          모든 세션을 끊으세요.
        </span>
      </div>

      {query.isPending && <p className="ac__line">불러오는 중…</p>}

      {query.data && query.data.entries.length === 0 && (
        <p className="ac__line">아직 기록된 활동이 없습니다.</p>
      )}

      {query.data && query.data.entries.length > 0 && (
        <>
          <ul className="ac__list">
            {query.data.entries.map((entry) => (
              <li key={entry.id} className={'ac__item ac__item--' + severityOf(entry.action)}>
                <div className="ac__itemMain">
                  <span className="ac__action">{labelOf(entry.action)}</span>
                  <span className="ac__time">{formatRelativeDate(entry.createdAt)}</span>
                </div>
                <div className="ac__itemMeta">
                  {formatIp(entry.ipAddress)}
                  {entry.userAgent && ' · ' + parseDevice(entry.userAgent)}
                </div>
              </li>
            ))}
          </ul>

          <div className="ac__pager">
            <button
              type="button"
              className="ac__pageBtn"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← 이전
            </button>
            <span className="ac__pageLabel">
              {query.data.totalElements > 0
                ? `${page * query.data.size + 1}–${Math.min((page + 1) * query.data.size, query.data.totalElements)} / ${query.data.totalElements}`
                : '0'}
            </span>
            <button
              type="button"
              className="ac__pageBtn"
              disabled={!query.data.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              다음 →
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ---------- helpers ----------

const ACTION_LABELS: Record<string, string> = {
  REGISTER:                '가입',
  LOGIN_SUCCESS:           '로그인 성공',
  LOGIN_FAIL:              '로그인 실패',
  LOGIN_2FA_SUCCESS:       '2단계 인증 통과',
  LOGIN_2FA_FAIL:          '2단계 인증 실패',
  LOGOUT:                  '로그아웃',
  ACCOUNT_LOCKED:          '계정 잠금',
  MASTER_PASSWORD_CHANGE:  '보관함 비밀번호 변경',
  TOTP_ENABLED:            '2FA 활성화',
  TOTP_DISABLED:           '2FA 비활성화',
  RECOVERY_USED:           'Recovery code 사용',
  SESSION_REVOKED:         '세션 끊기',
  OTHER_SESSIONS_REVOKED:  '다른 세션 일괄 끊기',
  ALL_SESSIONS_REVOKED:    '모든 세션 강제 로그아웃',
  ITEM_CREATE:             '항목 추가',
  ITEM_UPDATE:             '항목 수정',
  ITEM_DELETE:             '항목 삭제',
};

function labelOf(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** 시각적 강조용. ok/info/warn/danger 4단계 */
function severityOf(action: string): 'ok' | 'info' | 'warn' | 'danger' {
  switch (action) {
    case 'LOGIN_FAIL':
    case 'LOGIN_2FA_FAIL':
    case 'ACCOUNT_LOCKED':
    case 'RECOVERY_USED':
      return 'danger';
    case 'MASTER_PASSWORD_CHANGE':
    case 'TOTP_ENABLED':
    case 'TOTP_DISABLED':
    case 'OTHER_SESSIONS_REVOKED':
    case 'ALL_SESSIONS_REVOKED':
      return 'warn';
    case 'LOGIN_SUCCESS':
    case 'LOGIN_2FA_SUCCESS':
    case 'REGISTER':
      return 'ok';
    default:
      return 'info';
  }
}

function formatIp(ip: string | null | undefined): string {
  if (!ip || ip.length === 0) return '주소 없음';
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '127.0.0.1') return 'localhost';
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  return ip;
}

function parseDevice(ua: string | null | undefined): string {
  if (!ua) return '알 수 없는 기기';
  let os = '기타';
  if (/iPad/.test(ua)) os = 'iPad';
  else if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = '브라우저';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

  return `${browser} · ${os}`;
}

function formatRelativeDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}
