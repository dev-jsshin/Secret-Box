interface LogoProps {
  size?: number;
  pulsing?: boolean;
}

/**
 * SecretBox brand mark — a precision instrument:
 * a hairline cube with a vault tumbler at its center.
 */
export default function Logo({ size = 36, pulsing = false }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        color: 'var(--amber)',
        animation: pulsing ? 'pulseGlow 1.4s var(--ease-soft) infinite' : undefined,
        transformOrigin: 'center',
      }}
      aria-label="SecretBox"
    >
      {/* outer chamber */}
      <rect
        x="4.5"
        y="4.5"
        width="31"
        height="31"
        stroke="currentColor"
        strokeWidth="0.6"
      />
      {/* corner ticks */}
      <path d="M4.5 9.5 L4.5 4.5 L9.5 4.5"   stroke="currentColor" strokeWidth="0.6" />
      <path d="M30.5 4.5 L35.5 4.5 L35.5 9.5" stroke="currentColor" strokeWidth="0.6" />
      <path d="M35.5 30.5 L35.5 35.5 L30.5 35.5" stroke="currentColor" strokeWidth="0.6" />
      <path d="M9.5 35.5 L4.5 35.5 L4.5 30.5" stroke="currentColor" strokeWidth="0.6" />
      {/* tumbler ring */}
      <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="0.6" />
      {/* tumbler ticks */}
      <line x1="20" y1="11.5" x2="20" y2="13.5" stroke="currentColor" strokeWidth="0.6" />
      <line x1="20" y1="26.5" x2="20" y2="28.5" stroke="currentColor" strokeWidth="0.6" />
      <line x1="11.5" y1="20" x2="13.5" y2="20" stroke="currentColor" strokeWidth="0.6" />
      <line x1="26.5" y1="20" x2="28.5" y2="20" stroke="currentColor" strokeWidth="0.6" />
      {/* center pip */}
      <circle cx="20" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
