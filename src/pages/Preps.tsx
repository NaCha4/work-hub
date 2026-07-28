import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import SessionManager from '../components/SessionManager'
import { useAuth } from '../lib/auth'
import { byUpdated, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import {
  PREP_SANDBOX,
  compressionSupported,
  downloadHtml,
  packHtml,
  resolvePrepHtml,
  withViewerBridge,
} from '../lib/exportHtml'
import { RTDB_MAX, dropPrepBody, getPrepBody, putPrepBody } from '../lib/live'
import { formatDate, parseTags, today } from '../lib/markdown'
import type { Prep } from '../lib/types'

/**
 * 본문을 어디에 둘지 가르는 선.
 *
 * Firestore 문서 하나는 1MiB 를 넘을 수 없다(하드 리밋). 눌러 담은 크기가 이 선
 * 아래면 문서 안에 두고, 넘으면 원본 그대로 Realtime Database 로 보낸다.
 * 대부분의 자료는 잘 눌려서 문서 안에 들어가고, 이미지를 박아 넣은 자료만 넘어간다.
 */
const FIRESTORE_MAX = 900 * 1024

const kb = (n: number) => `${Math.round(n / 1024).toLocaleString()}KB`
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`

const blank = (uid: string, name: string): Prep => ({
  id: '',
  title: '',
  subtitle: '',
  date: today(),
  store: '',
  html: '',
  tags: [],
  authorUid: uid,
  authorName: name,
  createdAt: 0,
  updatedAt: 0,
})

export default function Preps() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Prep>('preps', !!member, byUpdated)
  const [editing, setEditing] = useState<Prep | null>(null)
  const [sharing, setSharing] = useState<Prep | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const loc = useLocation()
  const consumed = useRef(false)

  // 통합 검색에서 넘어오면 그 자료를 바로 연다. 목록이 로드된 뒤 한 번만.
  useEffect(() => {
    const s = loc.state as { open?: string } | null
    if (!s?.open || consumed.current || items.length === 0) return
    const target = items.find((p) => p.id === s.open)
    if (target) {
      consumed.current = true
      setEditing(target)
    }
  }, [loc.state, items])

  /**
   * 편집 중인 자료의 본문. 저장 위치가 세 갈래(문서 안 눌러 담기 / 예전 원문 /
   * RTDB 원본)라 화면에서는 여기 하나로 모아 쓴다. 미리보기·내려받기·저장이 이걸 본다.
   */
  const [body, setBody] = useState('')
  // 아직 RTDB 에 올리지 않은 본문. 새 자료는 저장하며 id 가 생겨야 올릴 수 있다.
  const [dirtyBody, setDirtyBody] = useState(false)

  useEffect(() => {
    if (!editing) {
      setBody('')
      setDirtyBody(false)
      return
    }
    if (dirtyBody) return // 방금 고른 파일이 있으면 그대로 둔다
    let alive = true
    const load = async () =>
      editing.store === 'rtdb' && editing.id
        ? await getPrepBody(editing.id)
        : await resolvePrepHtml(editing)
    void load().then((h) => { if (alive) setBody(h) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const preview = body ? withViewerBridge(body) : ''

  async function save() {
    if (!editing) return
    if (!editing.title.trim()) return alert('제목을 입력해 주세요.')
    if (!body.trim() && !editing.content) return alert('HTML 파일을 올려 주세요.')

    const { id, createdAt: _c, updatedAt: _u, ...rest } = editing
    // 예전 문서에는 store 칸이 없다. Firestore 는 undefined 를 받지 않으므로 채워 보낸다.
    const data = { ...rest, store: editing.store ?? '' }

    const docId = id || (await createDoc('preps', data))
    if (id) await updateDocById('preps', id, data)
    else setEditing({ ...editing, id: docId })

    if (editing.store === 'rtdb' && dirtyBody) await putPrepBody(docId, body)
    setDirtyBody(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function pick(f: File | undefined) {
    if (!editing || !f) return
    if (!/\.html?$/i.test(f.name)) return alert('HTML 파일만 올릴 수 있습니다.')
    if (f.size > RTDB_MAX) {
      return alert(`파일이 너무 큽니다 (${mb(f.size)}). ${mb(RTDB_MAX)} 까지 올릴 수 있습니다.`)
    }

    const text = await f.text()
    // 제목을 아직 안 정했으면 파일 이름을 가져다 쓴다. 매번 두 번 타이핑할 이유가 없다.
    const title = editing.title || f.name.replace(/\.html?$/i, '')
    const packed = compressionSupported ? await packHtml(text) : ''

    setBody(text)
    if (packed && packed.length <= FIRESTORE_MAX) {
      // 눌러서 들어가면 문서 안에 둔다. 저장소가 하나로 끝나 다루기 쉽다.
      setEditing({ ...editing, store: '', htmlz: packed, html: '', title })
      setDirtyBody(false)
    } else {
      // 이미지를 박아 넣은 자료는 눌러도 줄지 않는다. 원본 그대로 RTDB 로 보낸다.
      setEditing({ ...editing, store: 'rtdb', htmlz: '', html: '', title })
      setDirtyBody(true)
    }
  }

  /** 목록에서 바로 내려받기. 편집 화면 밖이라 본문을 여기서 찾아온다. */
  async function download(p: Prep) {
    const html = p.store === 'rtdb' ? await getPrepBody(p.id) : await resolvePrepHtml(p)
    downloadHtml(p, html)
  }

  async function remove(p: Prep) {
    if (!confirm(`"${p.title}" 를 삭제할까요?`)) return
    await deleteDocById('preps', p.id)
    if (p.store === 'rtdb') await dropPrepBody(p.id)
    if (editing?.id === p.id) setEditing(null)
  }

  if (editing) {
    const rawSize = new Blob([body]).size
    const hasFile = !!body
    return (
      <div className="page">
        <div className="page-head">
          <button className="btn ghost" onClick={() => setEditing(null)}>← 목록</button>
          <h1 style={{ fontSize: 17 }}>{editing.title || '새 준비자료'}</h1>
          <span className="spacer" />
          {saved && <span className="muted" style={{ fontSize: 12 }}>저장됨</span>}
          <button
            className="btn sm"
            onClick={() => frame.current?.contentWindow?.postMessage('wh:print', '*')}
          >
            인쇄 · PDF
          </button>
          <button className="btn sm" onClick={() => downloadHtml(editing, body)}>HTML 내려받기</button>
          <button
            className="btn sm"
            onClick={() => (editing.id ? setShowShare(true) : alert('먼저 저장해 주세요.'))}
          >
            <Icon name="key" size={14} />
            세션 공유
          </button>
          <button className="btn primary" onClick={save}>저장</button>
        </div>

        {/* 편집 중에는 화면의 최신 내용을 그대로 넘겨, '갱신' 이 현재 자료를 반영하게 한다. */}
        {showShare && <SessionManager prep={editing} onClose={() => setShowShare(false)} />}

        <div className="row" style={{ marginBottom: 8 }}>
          <div className="field" style={{ flex: 2 }}>
            <label>제목</label>
            <input className="input" value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>부제</label>
            <input className="input" value={editing.subtitle}
              onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '0 0 150px' }}>
            <label>일자</label>
            <DateInput value={editing.date} onChange={(v) => setEditing({ ...editing, date: v })} />
          </div>
        </div>

        <div className="upload-bar">
          <input
            ref={file}
            type="file"
            accept=".html,.htm,text/html"
            style={{ display: 'none' }}
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
          />
          <button className="btn sm" onClick={() => file.current?.click()}>
            {hasFile ? 'HTML 파일 교체' : 'HTML 파일 올리기'}
          </button>
          {hasFile ? (
            <span className="muted">
              {kb(rawSize)}
              {editing.htmlz && ` · 눌러 담아 ${kb(editing.htmlz.length)}`}
              {editing.store === 'rtdb' && ' · 원본 그대로 보관'}
              {dirtyBody && ' · 저장 안 됨'}
            </span>
          ) : editing.content ? (
            <span className="muted">예전 마크다운 자료입니다. 파일을 올리면 대체됩니다.</span>
          ) : (
            <span className="muted">AI 로 만든 단일 HTML 파일을 그대로 올리면 됩니다.</span>
          )}
          <span className="spacer" />
          <div className="field" style={{ margin: 0, maxWidth: 260, flex: 1 }}>
            <input className="input" placeholder="태그 (쉼표 구분)" value={editing.tags.join(', ')}
              onChange={(e) => setEditing({ ...editing, tags: parseTags(e.target.value) })} />
          </div>
        </div>

        {preview ? (
          <iframe
            ref={frame}
            className="prep-frame"
            title={editing.title || '미리보기'}
            srcDoc={preview}
            sandbox={PREP_SANDBOX}
          />
        ) : (
          <div className="empty">올린 파일이 여기에 그대로 표시됩니다.</div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>회의 준비자료</h1>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEditing(blank(member!.uid, member!.displayName))}>
          + 준비자료
        </button>
      </div>
      <p className="page-sub">
        AI 로 만든 단일 HTML 파일을 올리면 그대로 보여줍니다. <b>세션 코드</b>를 발급하면
        받은 사람이 로그인 없이 그 자료만 볼 수 있습니다.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}
      {!loading && items.length === 0 && <div className="empty">아직 준비자료가 없습니다.</div>}

      <div className="grid cols-2">
        {items.map((p) => (
          <div className="card" key={p.id}>
            <div className="card-head">
              <h3>{p.title || '(제목 없음)'}</h3>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 11.5 }}>{formatDate(p.updatedAt)}</span>
            </div>
            {p.subtitle && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{p.subtitle}</p>}
            <div className="muted" style={{ fontSize: 12 }}>{p.date} · {p.authorName}</div>
            {p.tags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {p.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => setEditing(p)}>열기</button>
              <button className="btn sm" onClick={() => void download(p)}>HTML</button>
              <button className="btn sm" onClick={() => setSharing(p)}>
                <Icon name="key" size={13} />
                세션
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn ghost sm danger" onClick={() => remove(p)}>삭제</button>
            </div>
          </div>
        ))}
      </div>

      {sharing && <SessionManager prep={sharing} onClose={() => setSharing(null)} />}
    </div>
  )
}
