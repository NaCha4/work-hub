import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CodeEntry from '../components/CodeEntry'
import { useAuth } from '../lib/auth'
import { firebaseConfigured } from '../lib/firebase'
import { buildPrepHtml, downloadHtml } from '../lib/exportHtml'
import { fetchSession } from '../lib/session'
import type { Session } from '../lib/types'

/**
 * 비로그인 방문자용 화면. 코드를 입력하면 발표자가 지정한 준비자료를 보여준다.
 * 앱의 나머지 부분과 달리 인증을 요구하지 않으므로 Layout 을 쓰지 않는다.
 *
 * 열지 못한 코드에 대해서는 아무 말도 하지 않고 입력 화면으로 되돌린다.
 * 없는 코드인지 만료됐는지 닫혔는지를 구분해 알려주면 세션의 존재 여부가 새어 나간다.
 */
export default function SessionView() {
  const { code: codeParam } = useParams()
  const nav = useNavigate()
  const { status, signIn } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!codeParam) {
      setSession(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchSession(codeParam).then((r) => {
      if (cancelled) return
      setLoading(false)
      setSession(r.ok ? r.session : null)
    })
    return () => { cancelled = true }
  }, [codeParam])

  const html = useMemo(
    () => (session ? buildPrepHtml(session.snapshot) : ''),
    [session],
  )

  if (!firebaseConfigured) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>준비 중입니다</h1>
          <p>아직 서버 설정이 끝나지 않았습니다.</p>
        </div>
      </div>
    )
  }

  // 자료를 찾았을 때 — 내보내기 HTML 과 완전히 같은 화면을 iframe 으로 띄운다.
  if (session) {
    return (
      <div className="viewer">
        <header className="viewer-bar">
          <span className="viewer-title">{session.snapshot.title}</span>
          {session.note && <span className="viewer-note">{session.note}</span>}
          <span className="spacer" />
          <button
            className="btn ghost sm"
            onClick={() => frame.current?.contentWindow?.print()}
          >
            인쇄 · PDF
          </button>
          <button className="btn ghost sm" onClick={() => downloadHtml(session.snapshot)}>
            내려받기
          </button>
          <button className="btn ghost sm" onClick={() => nav('/s')}>
            다른 코드
          </button>
        </header>
        <iframe
          ref={frame}
          className="viewer-frame"
          title={session.snapshot.title}
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
        />
      </div>
    )
  }

  if (loading) {
    return <div className="login-wrap"><p className="muted">불러오는 중…</p></div>
  }

  // 이 경로는 인증 게이트 바깥이라 로그인해도 여기 머문다. 로그인한 사람에게
  // 링크를 하나도 주지 않으면 입력창만 남은 막다른 화면이 되므로 돌아갈 길을 둔다.
  // 로그아웃 상태에서는 첫 화면과 똑같이 두어, 코드를 잘못 넣었을 때
  // 로그인으로 돌아갈 길이 사라지지 않게 한다.
  return (
    <CodeEntry
      footer={
        status === 'ready' ? (
          <button type="button" className="text-link" onClick={() => nav('/')}>
            Work Hub 로 돌아가기
          </button>
        ) : (
          <button type="button" className="text-link" onClick={signIn}>
            로그인
          </button>
        )
      }
    />
  )
}
