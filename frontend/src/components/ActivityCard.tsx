import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usersApi, type AuditLogEntry } from '../api/users';

import './ActivityCard.css';

/**
 * 본인 활동 로그 카드 — Stripe / Linear 스타일의 깔끔한 피드.
 * 날짜 묶음 + 액션별 아이콘 칩(좌측) + 시간 우측 정렬 + 메타 작은 mono.
 */
export default function ActivityCard() {
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ['user-activity', page],
    queryFn: () => usersApi.getActivity(page, 30),
    placeholderData: (prev) => prev,
  });

  const grouped = useMemo(() => groupByDay(query.data?.entries ?? []), [query.data]);

  return (
    <section className="settings__card rise delay-3">
      <h2 className="settings__cardTitle">활동 내역</h2>

      {query.isPending && <p className="ac__line">불러오는 중…</p>}

      {query.data && query.data.entries.length === 0 && (
        <p className="ac__line">아직 기록된 활동이 없습니다.</p>
      )}

      {grouped.length > 0 && (
        <>
          <div className="ac__feed">
            {grouped.map(([dayLabel, entries]) => (
              <div key={dayLabel} className="ac__group">
                <div className="ac__dayHeader">
                  <span className="ac__dayLabel">{dayLabel}</span>
                  <span className="ac__dayLine" />
                </div>
                <ul className="ac__list">
                  {entries.map((entry) => (
                    <ActivityRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {query.data && (
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
          )}
        </>
      )}
    </section>
  );
}

function ActivityRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTION_META[entry.action] ?? FALLBACK_META;
  return (
    <li className="ac__entry">
      <div className={'ac__icon ac__icon--' + meta.tone}>
        {meta.icon}
      </div>
      <div className="ac__body">
        <div className="ac__row">
          <span className="ac__action">{meta.label}</span>
          <span className="ac__time">{formatTime(entry.createdAt)}</span>
        </div>
        <div className="ac__meta">
          {formatIp(entry.ipAddress)}
          {entry.userAgent && '  ·  ' + parseDevice(entry.userAgent)}
        </div>
      </div>
    </li>
  );
}

// ---------- 날짜 묶음 ----------

function groupByDay(entries: AuditLogEntry[]): [string, AuditLogEntry[]][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const buckets = new Map<string, AuditLogEntry[]>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) label = '오늘';
    else if (d.getTime() === yesterday.getTime()) label = '어제';
    else label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(e);
  }
  return Array.from(buckets.entries());
}

// ---------- 액션 메타 (라벨 + 아이콘 + 톤) ----------

type Tone = 'ok' | 'neutral' | 'warn' | 'danger';
interface ActionMeta { label: string; icon: JSX.Element; tone: Tone; }

const ACTION_META: Record<string, ActionMeta> = {
  REGISTER:                { label: '가입',                  icon: <UserPlusIcon />, tone: 'ok' },
  LOGIN_SUCCESS:           { label: '로그인',                icon: <LoginIcon />,    tone: 'ok' },
  LOGIN_2FA_SUCCESS:       { label: '2단계 인증 통과',         icon: <ShieldCheckIcon />, tone: 'ok' },
  LOGOUT:                  { label: '로그아웃',              icon: <LogoutIcon />,   tone: 'neutral' },
  LOGIN_FAIL:              { label: '로그인 실패',            icon: <XCircleIcon />,  tone: 'danger' },
  LOGIN_2FA_FAIL:          { label: '2단계 인증 실패',         icon: <XCircleIcon />,  tone: 'danger' },
  ACCOUNT_LOCKED:          { label: '계정 잠금',              icon: <LockIcon />,     tone: 'danger' },
  RECOVERY_USED:           { label: 'Recovery code 사용',     icon: <AlertTriangleIcon />, tone: 'danger' },
  MASTER_PASSWORD_CHANGE:  { label: '보관함 비밀번호 변경',     icon: <KeyIcon />,      tone: 'warn' },
  TOTP_ENABLED:            { label: '2FA 활성화',             icon: <ShieldIcon />,   tone: 'warn' },
  TOTP_DISABLED:           { label: '2FA 비활성화',           icon: <ShieldOffIcon />, tone: 'warn' },
  SESSION_REVOKED:         { label: '세션 끊기',              icon: <PowerOffIcon />, tone: 'neutral' },
  OTHER_SESSIONS_REVOKED:  { label: '다른 세션 일괄 끊기',     icon: <PowerOffIcon />, tone: 'warn' },
  ALL_SESSIONS_REVOKED:    { label: '모든 세션 강제 로그아웃', icon: <PowerOffIcon />, tone: 'warn' },
  ITEM_CREATE:             { label: '항목 추가',              icon: <PlusIcon />,     tone: 'neutral' },
  ITEM_UPDATE:             { label: '항목 수정',              icon: <EditIcon />,     tone: 'neutral' },
  ITEM_DELETE:             { label: '항목 삭제',              icon: <TrashIcon />,    tone: 'neutral' },
};
const FALLBACK_META: ActionMeta = { label: '활동', icon: <DotIcon />, tone: 'neutral' };

// ---------- 포맷터 ----------

function formatIp(ip: string | null | undefined): string {
  if (!ip) return '주소 없음';
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

function formatTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  // 같은 날 내면 시각만 (HH:mm)
  const d = new Date(ts);
  const today = new Date();
  if (d.getFullYear() === today.getFullYear()
      && d.getMonth() === today.getMonth()
      && d.getDate() === today.getDate()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  // 다른 날이면 시각만 (날짜는 그룹 헤더에 표시되므로 중복 방지)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- inline icons (Lucide-style 1.6 stroke) ----------
const IS = {
  width: 14, height: 14, fill: 'none' as const,
  stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
function LoginIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
); }
function LogoutIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
); }
function UserPlusIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
); }
function XCircleIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
); }
function LockIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
); }
function KeyIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <circle cx="8" cy="15" r="4" />
    <line x1="10.83" y1="12.17" x2="20" y2="3" />
    <line x1="17" y1="6" x2="20" y2="9" />
  </svg>
); }
function ShieldIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
); }
function ShieldCheckIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
); }
function ShieldOffIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18" />
    <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
); }
function AlertTriangleIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
); }
function PowerOffIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
); }
function PlusIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
); }
function EditIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
); }
function TrashIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <polyline points="3 6 5 6 21 6" />
    <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
); }
function DotIcon() { return (
  <svg viewBox="0 0 24 24" {...IS}>
    <circle cx="12" cy="12" r="2" />
  </svg>
); }
