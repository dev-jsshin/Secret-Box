import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import './Vault.css';

export default function Vault() {
  return (
    <div className="page">
      <main className="vault">
        <header className="vault__head rise delay-1">
          <Logo size={28} />
          <span className="eyebrow">vault</span>
        </header>

        <section className="rise delay-2">
          <h1 className="serif-display vault__title">
            <em>SecretBox</em>는 준비 중
          </h1>
          <p className="vault__lede">
            SecretBox 항목 관리 화면은 다음 단계에서 추가됩니다.
          </p>
        </section>

        <Link to="/login" className="vault__back rise delay-3">
          ← 로그인 화면으로
        </Link>
      </main>
    </div>
  );
}
