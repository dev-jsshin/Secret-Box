import { type StrengthScore } from '../lib/passwordTools';
import './PasswordStrengthMeter.css';

interface Props {
  score: StrengthScore;
  label: string;
}

export default function PasswordStrengthMeter({ score, label }: Props) {
  return (
    <div className="sb-strength" aria-label={`Password strength: ${label}`}>
      <div className="sb-strength__bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`sb-strength__bar${i <= score ? ' is-on' : ''}`}
            data-step={i}
          />
        ))}
      </div>
      <span className="sb-strength__label" data-score={score}>
        {label}
      </span>
    </div>
  );
}
