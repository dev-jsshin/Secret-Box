import { useState } from 'react';
import './Avatar.css';

interface AvatarProps {
  name: string;
  iconUrl?: string;
  brandColor?: string;
  size?: number;
}

/**
 * 카탈로그 아이콘이 있으면 SVG, 없으면 첫 글자 + 브랜드 색 폴백.
 */
export default function Avatar({ name, iconUrl, brandColor, size = 36 }: AvatarProps) {
  const [errored, setErrored] = useState(false);

  if (iconUrl && !errored) {
    return (
      <img
        src={iconUrl}
        alt={name}
        width={size}
        height={size}
        className="sb-avatar sb-avatar--img"
        onError={() => setErrored(true)}
      />
    );
  }

  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  const bg = brandColor || 'rgba(212, 146, 74, 0.15)';
  const fg = brandColor ? '#fff' : 'var(--amber)';

  return (
    <div
      className="sb-avatar sb-avatar--text"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size * 0.42,
      }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
