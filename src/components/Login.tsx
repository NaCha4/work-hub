import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { status, error, signIn, signOut } = useAuth()

  // 빌드에 Firebase 설정이 들어가지 않은 상태. 로컬과 배포본의 원인이 서로 다르므로
  // 둘 다 안내한다 — 배포본에서 이 화면이 보이면 십중팔구 GitHub Secrets 누락이다.
  if (status === 'unconfigured') {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>설정이 필요합니다</h1>
          {local ? (
            <p>
              <code>.env.example</code> 을 <code>.env</code> 로 복사한 뒤 Firebase 웹 앱
              설정값을 채워 주세요. 절차는 <code>README.md</code> 의 “Firebase 준비” 항목에 있습니다.
            </p>
          ) : (
            <p>
              배포 빌드에 Firebase 설정값이 들어 있지 않습니다. 저장소의
              <b> Settings → Secrets and variables → Actions </b> 에
              <code>VITE_FIREBASE_*</code> 6개를 등록한 뒤 다시 배포해 주세요.
            </p>
          )}
        </div>
      </div>
    )
  }

  // 허용되지 않은 계정이라면 발표 자료를 보러 온 방문자일 가능성이 높다.
  // 막다른 화면을 보여주는 대신 세션 코드 입력으로 안내한다.
  if (status === 'no-access') {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
          <h1>발표 자료를 보러 오셨나요?</h1>
          <p>
            이 계정으로는 Work Hub 에 들어올 수 없습니다.
            받으신 세션 코드를 입력하면 공유된 자료를 볼 수 있습니다.
          </p>
          <Link
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
            to="/s"
          >
            세션 코드 입력
          </Link>
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={signOut}>
            다른 계정으로 로그인
          </button>
          {/* 방문자에게는 의미 없는 줄이지만, 본인이 막혔을 때 원인을 짚으려면 필요하다. */}
          {error && (
            <p className="muted" style={{ fontSize: 11, marginTop: 14, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div style={{ fontSize: 40, marginBottom: 8 }}>🗂️</div>
        <h1>Work Hub</h1>
        <p>업무 일지 · 할 일 · 회의록 · 준비자료를 한곳에서.</p>
        {error && <div className="error-banner">{error}</div>}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={signIn}>
          Google 계정으로 로그인
        </button>
        <p style={{ marginTop: 18, marginBottom: 0, fontSize: 12 }}>
          허용된 계정만 접근할 수 있습니다.
          <br />
          발표 자료를 보러 오셨다면 <Link to="/s">세션 코드 입력</Link>
        </p>
      </div>
    </div>
  )
}
