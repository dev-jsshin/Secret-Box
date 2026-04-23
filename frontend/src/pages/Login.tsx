import { Link, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import './Login.css';

interface LocationState {
  justRegistered?: boolean;
  email?: string;
}

export default function Login() {
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  return (
    <div className="page">
      <main className="login">
        <header className="login__head">
          <Logo size={28} />
          <span className="eyebrow">
            <span className="num">02</span> &nbsp;/&nbsp; 로그인
          </span>
        </header>

        {state.justRegistered && (
          <section className="login__success">
            <span className="login__successSigil">✓</span>
            <div>
              <p className="login__successTitle">가입이 완료됐습니다.</p>
              <p className="login__successBody">
                {state.email && <><span className="mono">{state.email}</span> 계정이 생성됐습니다. </>}
                로그인 화면은 다음 단계에서 추가될 예정입니다.
              </p>
            </div>
          </section>
        )}

        <h1 className="serif-display login__title">
          로그인 <em>준비 중</em>
        </h1>

        <p className="login__lede">
          가입 정보가 데이터베이스에 잘 저장됐는지 확인하려면 아래 명령을 사용하세요.
        </p>

        <pre className="login__code">
{`docker exec secretbox-postgres psql -U secretbox -d secretbox \\
  -c "SELECT email, kdf_iterations, length(protected_dek) AS dek_len FROM users;"`}
        </pre>

        <Link to="/register" className="login__back">
          ← 가입 화면으로
        </Link>

        <p className="login__credit">
          Crafted by{' '}
          <span className="login__creditName">dev-jsshin</span>
          {' '}·{' '}
          <span className="login__creditName">신준섭</span>
        </p>
      </main>
    </div>
  );
}
