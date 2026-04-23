import './SecurityExplainer.css';

const STEPS = [
  {
    no: '01',
    title: '키 파생 (KEK)',
    body: (
      <>
        입력한 비밀번호 + 랜덤 salt가 <code>Argon2id</code>를 거쳐
        <strong> 키 암호화 키 (KEK)</strong>가 됩니다.<br />
        이 KEK는 <span className="se-emp">절대 서버로 전송되지 않습니다.</span>
      </>
    ),
  },
  {
    no: '02',
    title: '데이터 키 생성 (DEK)',
    body: (
      <>
        랜덤 32바이트 <strong>데이터 암호화 키 (DEK)</strong>를 만듭니다.<br />
        앞으로 저장될 모든 비밀번호 항목은 이 DEK로 암호화됩니다.
      </>
    ),
  },
  {
    no: '03',
    title: 'DEK를 KEK로 잠금',
    body: (
      <>
        <code>AES-256-GCM</code>으로 DEK를 KEK로 암호화 → <code>protectedDek</code>.<br />
        서버에는 이 <strong>잠긴 상자</strong>만 보관됩니다.
      </>
    ),
  },
  {
    no: '04',
    title: '인증용 해시 파생',
    body: (
      <>
        KEK에서 <code>HMAC-SHA256</code>으로 단방향 <code>authHash</code>를 만듭니다.<br />
        서버는 이 값을 <strong>한 번 더 Argon2로 해시</strong>해서 저장합니다.
      </>
    ),
  },
];

export default function SecurityExplainer() {
  return (
    <div className="se">
      <header className="se__head">
        <span className="eyebrow">작동 원리</span>
        <h2 className="serif-display se__title">
          비밀번호가 <em>서버에 닿지 않는</em> 이유
        </h2>
        <p className="se__lede">
          가입 버튼을 누르면 브라우저 안에서 4단계가 일어납니다.<br />
          서버로는 비밀번호 자체가 아닌,
          {' '}<strong>비밀번호로부터 단방향 함수로 파생된 값들</strong>이 전송됩니다.
        </p>
      </header>

      <ol className="se__steps">
        {STEPS.map((s) => (
          <li key={s.no} className="se__step">
            <span className="se__no">{s.no}</span>
            <div className="se__body">
              <h3 className="se__stepTitle">{s.title}</h3>
              <p className="se__text">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="se__compareNote">
        아래 값들은 비밀번호로부터 만들어지지만,
        {' '}<strong>역산해서 비밀번호를 알아낼 수 없습니다.</strong>
      </p>

      <section className="se__compare">
        <div className="se__col">
          <h4 className="se__colHead">서버로 전송 / DB 저장</h4>
          <ul className="se__list">
            <li>이메일</li>
            <li><code>authHash</code> — 단방향 해시</li>
            <li><code>protectedDek</code> — 잠긴 데이터 키</li>
            <li>KDF salt + 파라미터</li>
          </ul>
        </div>
        <div className="se__col se__col--never">
          <h4 className="se__colHead">전송하지 않음 / 브라우저 안에만</h4>
          <ul className="se__list">
            <li>마스터 비밀번호</li>
            <li>KEK</li>
            <li>DEK</li>
            <li>저장된 비밀번호 평문</li>
          </ul>
        </div>
      </section>

      <footer className="se__foot">
        <p>
          DB가 통째로 유출돼도 본인의 마스터 비밀번호 없이는 그 무엇도 읽을 수 없습니다.<br />
          동시에, 같은 이유로 <strong>비밀번호를 잊으면 복구해드릴 수 없습니다.</strong>
        </p>
      </footer>
    </div>
  );
}
