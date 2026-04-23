export type StrengthScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface StrengthReport {
  score: StrengthScore;
  label: string;
}

const LABELS = ['—', '취약', '약함', '보통', '강함', '매우 강함'] as const;

export function scorePassword(password: string): StrengthReport {
  if (!password) return { score: 0, label: LABELS[0] };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 18) score++;

  const clamped = Math.min(score, 5) as StrengthScore;
  return { score: clamped, label: LABELS[clamped] };
}
