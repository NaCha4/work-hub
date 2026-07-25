import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { firebaseConfigured } from '../lib/firebase'
import { buildPrepHtml, downloadHtml } from '../lib/exportHtml'
import {
  fetchSession,
  formatCode,
  isValidCodeShape,
  normalizeCode,
  type FetchResult,
} from '../lib/session'
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
  const [input, setInput] = useState('')
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidCodeShape(input)) {
      setError('8자리 코드를 정확히 입력해 주세요.')
      return
    }
    nav(`/s/${formatCode(input)}`)
  }

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

  // 코드 입력 화면
  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
        <h1>세션 코드 입력</h1>
        <p>발표자에게 받은 8자리 코드를 입력하면 자료를 볼 수 있습니다.</p>
        {error && <div className="error-banner">{error}</div>}
        <input
          className="input code-input"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          maxLength={9}
          value={input}
          onChange={(e) => {
            const raw = normalizeCode(e.target.value).slice(0, 8)
            setInput(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw)
            setError(null)
          }}
        />
        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
          disabled={loading}
        >
          {loading ? '확인 중…' : '자료 보기'}
        </button>
        <p style={{ marginTop: 18, marginBottom: 0, fontSize: 12 }}>
          코드가 없으신가요? 발표자에게 문의해 주세요.
        </p>
      </form>
    </div>
  )
}
