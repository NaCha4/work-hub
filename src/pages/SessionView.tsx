import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CodeEntry from '../components/CodeEntry'
import { useAuth } from '../lib/auth'
import { firebaseConfigured } from '../lib/firebase'
import { buildPrepHtml, downloadHtml } from '../lib/exportHtml'
import { fetchSession, type FetchResult } from '../lib/session'
import type { Session } from '../lib/types'

const MESSAGES: Record<Exclude<FetchResult, { ok: true }>['reason'], string> = {
  'not-found': '코드가 올바르지 않거나 더 이상 열람할 수 없는 세션입니다.',
  expired: '이 세션은 만료되었습니다. 발표자에게 새 코드를 요청해 주세요.',
  inactive: '이 세션은 현재 닫혀 있습니다. 발표자에게 문의해 주세요.',
  error: '자료를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
}

/**
 * 비로그인 방문자용 화면. 코드를 입력하면 발표자가 지정한 준비자료를 보여준다.
 * 앱의 나머지 부분과 달리 인증을 요구하지 않으므로 Layout 을 쓰지 않는다.
 */
export default function SessionView() {
  const { code: codeParam } = useParams()
  const nav = useNavigate()
  const { status, signIn } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!codeParam) {
      setSession(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchSession(codeParam).then((r) => {
      if (cancelled) return
      setLoading(false)
      if (r.ok) setSession(r.session)
      else {
        setSession(null)
        setError(MESSAGES[r.reason])
      }
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

  // 로그인 상태면 굳이 로그인 링크를 보여줄 이유가 없다.
  // 로그아웃 상태에서는 첫 화면과 똑같이 두어, 코드를 잘못 넣었을 때
  // 로그인으로 돌아갈 길이 사라지지 않게 한다.
  return (
    <CodeEntry
      externalError={error}
      footer={
        status === 'ready' ? undefined : (
          <button type="button" className="text-link" onClick={signIn}>
            로그인
          </button>
        )
      }
    />
  )
}
