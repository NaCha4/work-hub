import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CodeEntry from '../components/CodeEntry'
import LiveLayer from '../components/LiveLayer'
import { useAuth } from '../lib/auth'
import { firebaseConfigured, liveConfigured } from '../lib/firebase'
import {
  PREP_SANDBOX,
  STAGE_WIDTH,
  downloadHtml,
  resolvePrepHtml,
  withViewerBridge,
} from '../lib/exportHtml'
import { getSessionBody, syncMeta } from '../lib/live'
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
  const { status, signIn, user } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  // 자료의 실제 높이. iframe 이 알려주면 그만큼 늘려 안쪽 스크롤을 없앤다.
  const [docHeight, setDocHeight] = useState(800)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; h?: number }
      if (d?.t === 'wh:size' && typeof d.h === 'number' && d.h > 0) setDocHeight(Math.ceil(d.h))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // 고정 폭으로 펼친 자료를 창 너비에 맞춰 줄이거나 키운다.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / STAGE_WIDTH)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [session])

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

  // 자료를 풀거나 받아오는 일이 있어 비동기다. 다리를 붙이지 않은 원본을 들고 있다가
  // 화면에 띄울 때만 붙인다. 내려받기는 원본 그대로 나가야 한다.
  const [raw, setRaw] = useState('')
  useEffect(() => {
    if (!session) {
      setRaw('')
      return
    }
    let alive = true
    const load = async () =>
      session.snapshot.store === 'rtdb'
        ? await getSessionBody(session.id)
        : await resolvePrepHtml(session.snapshot)
    void load().then((h) => { if (alive) setRaw(h) })
    return () => { alive = false }
  }, [session])

  const html = raw ? withViewerBridge(raw) : ''

  // 이 세션을 만든 사람만 덧칠할 수 있다. 나머지는 받아 보기만 한다.
  const presenter = !!user && !!session && session.createdBy === user.uid

  // RTDB 규칙은 Firestore 를 못 읽으므로 세션 상태를 그쪽에도 적어둬야 통로가 열린다.
  // 발표자가 화면을 열 때 맞춰두면 이 기능이 생기기 전에 만든 세션도 그대로 쓸 수 있다.
  useEffect(() => {
    if (!presenter || !session || !liveConfigured) return
    void syncMeta(session.id, {
      ownerUid: session.createdBy,
      active: session.active,
      expiresAt: session.expiresAt,
    })
  }, [presenter, session])

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
            onClick={() => frame.current?.contentWindow?.postMessage('wh:print', '*')}
          >
            인쇄 · PDF
          </button>
          <button className="btn ghost sm" onClick={() => downloadHtml(session.snapshot, raw)}>
            내려받기
          </button>
          <button className="btn ghost sm" onClick={() => nav('/s')}>
            다른 코드
          </button>
        </header>
        {/* 스크롤은 이 상자가 맡는다. 자료와 덧칠이 한 덩어리로 함께 움직여야
            좌표를 맞출 일이 없다. 안쪽은 고정 폭으로 펼치고 배율만 씌운다. */}
        <div className="viewer-stage" ref={stage}>
          <div className="stage-fit" style={{ height: docHeight * scale }}>
            <div
              className="stage-doc"
              style={{ width: STAGE_WIDTH, height: docHeight, transform: `scale(${scale})` }}
            >
              <iframe
                ref={frame}
                className="viewer-frame"
                title={session.snapshot.title}
                srcDoc={html}
                sandbox={PREP_SANDBOX}
                style={{ width: STAGE_WIDTH, height: docHeight }}
              />
              {liveConfigured && (
                <LiveLayer
                  code={session.id}
                  presenter={presenter}
                  stage={stage}
                  width={STAGE_WIDTH}
                  height={docHeight}
                  scale={scale}
                />
              )}
            </div>
          </div>
        </div>
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
