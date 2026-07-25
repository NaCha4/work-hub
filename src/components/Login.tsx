import CodeEntry from './CodeEntry'
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

  // 허용되지 않은 계정. 세션 코드는 여전히 쓸 수 있으므로 입력창을 그대로 둔다.
  if (status === 'no-access') {
    return (
      <CodeEntry
        footer={
          <>
            <button type="button" className="text-link" onClick={signOut}>
              다른 계정으로 로그인
            </button>
            {/* 방문자에게는 의미 없지만, 본인이 막혔을 때 원인을 짚으려면 필요하다. */}
            {error && <p className="entry-hint">{error}</p>}
          </>
        }
      />
    )
  }

  // 기본 화면. 이 앱을 여는 사람 대부분은 자료를 보러 온 팀원이다.
  return (
    <CodeEntry
      externalError={error}
      footer={
        <button type="button" className="text-link" onClick={signIn}>
          로그인
        </button>
      }
    />
  )
}
