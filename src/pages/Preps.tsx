import { useMemo, useRef, useState } from 'react'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import SessionManager from '../components/SessionManager'
import { useAuth } from '../lib/auth'
import { byUpdated, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { PREP_SANDBOX, downloadHtml, prepHtml, withPrintBridge } from '../lib/exportHtml'
import { formatDate, parseTags, today } from '../lib/markdown'
import type { Prep } from '../lib/types'

/**
 * Firestore 문서 하나는 1MiB 를 넘을 수 없다. 제목·태그가 함께 들어가므로
 * 여유를 두고 자른다. 이 선을 넘으면 저장 단계에서 실패하는 대신 미리 막는다.
 */
const MAX_BYTES = 700 * 1024

const blank = (uid: string, name: string): Prep => ({
  id: '',
  title: '',
  subtitle: '',
  date: today(),
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

  const preview = useMemo(
    () => (editing ? withPrintBridge(prepHtml(editing)) : ''),
    [editing],
  )

  async function save() {
    if (!editing) return
    if (!editing.title.trim()) return alert('제목을 입력해 주세요.')
    if (!editing.html.trim() && !editing.content) return alert('HTML 파일을 올려 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = editing
    if (id) {
      await updateDocById('preps', id, data)
    } else {
      const newId = await createDoc('preps', data)
      setEditing({ ...editing, id: newId })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function pick(f: File | undefined) {
    if (!editing || !f) return
    if (!/\.html?$/i.test(f.name)) return alert('HTML 파일만 올릴 수 있습니다.')
    if (f.size > MAX_BYTES) {
      return alert(
        `파일이 너무 큽니다 (${Math.round(f.size / 1024)}KB). ` +
          `${Math.round(MAX_BYTES / 1024)}KB 이하로 줄여 주세요. ` +
          '이미지를 많이 담았다면 그 부분을 덜어내면 줄어듭니다.',
      )
    }
    const text = await f.text()
    // 제목을 아직 안 정했으면 파일 이름을 가져다 쓴다. 매번 두 번 타이핑할 이유가 없다.
    setEditing({
      ...editing,
      html: text,
      title: editing.title || f.name.replace(/\.html?$/i, ''),
    })
  }

  async function remove(p: Prep) {
    if (!confirm(`"${p.title}" 를 삭제할까요?`)) return
    await deleteDocById('preps', p.id)
    if (editing?.id === p.id) setEditing(null)
  }

  if (editing) {
    const size = new Blob([editing.html]).size
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
          <button className="btn sm" onClick={() => downloadHtml(editing)}>HTML 내려받기</button>
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
            {editing.html ? 'HTML 파일 교체' : 'HTML 파일 올리기'}
          </button>
          {editing.html ? (
            <span className="muted">{Math.round(size / 1024).toLocaleString()}KB</span>
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
              <button className="btn sm" onClick={() => downloadHtml(p)}>HTML</button>
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
