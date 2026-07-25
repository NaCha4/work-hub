import { useMemo, useState } from 'react'
import SessionManager from '../components/SessionManager'
import { useAuth } from '../lib/auth'
import { byUpdated, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { buildPrepHtml, downloadHtml, openPreview } from '../lib/exportHtml'
import { formatDate, parseTags, renderMarkdown, today } from '../lib/markdown'
import type { Prep } from '../lib/types'

const STARTER = `## 배경
- 왜 이 논의가 필요한가

## 현황
| 항목 | 현재 | 목표 |
| --- | --- | --- |
|  |  |  |

## 제안
1.

## 논의가 필요한 것
- [ ]
`

const blank = (uid: string, name: string): Prep => ({
  id: '',
  title: '',
  subtitle: '',
  date: today(),
  content: STARTER,
  theme: 'light',
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

  const html = useMemo(
    () => (editing ? renderMarkdown(editing.content) : ''),
    [editing],
  )

  async function save() {
    if (!editing) return
    if (!editing.title.trim()) return alert('제목을 입력해 주세요.')
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

  async function copyHtml() {
    if (!editing) return
    await navigator.clipboard.writeText(buildPrepHtml(editing))
    alert('HTML 전체를 클립보드에 복사했습니다. 메일이나 사내 위키에 붙여넣으세요.')
  }

  async function remove(p: Prep) {
    if (!confirm(`"${p.title}" 를 삭제할까요?`)) return
    await deleteDocById('preps', p.id)
    if (editing?.id === p.id) setEditing(null)
  }

  if (editing) {
    return (
      <div className="page">
        <div className="page-head">
          <button className="btn ghost" onClick={() => setEditing(null)}>← 목록</button>
          <h1 style={{ fontSize: 17 }}>{editing.title || '새 준비자료'}</h1>
          <span className="spacer" />
          {saved && <span className="muted" style={{ fontSize: 12 }}>저장됨 ✓</span>}
          <select
            className="select"
            style={{ width: 120 }}
            value={editing.theme}
            onChange={(e) => setEditing({ ...editing, theme: e.target.value as Prep['theme'] })}
          >
            <option value="light">밝은 테마</option>
            <option value="dark">어두운 테마</option>
            <option value="slide">발표용</option>
          </select>
          <button className="btn sm" onClick={() => openPreview(editing)}>새 탭 미리보기</button>
          <button className="btn sm" onClick={() => downloadHtml(editing)}>HTML 내려받기</button>
          <button className="btn sm" onClick={copyHtml}>HTML 복사</button>
          <button
            className="btn sm"
            onClick={() => (editing.id ? setShowShare(true) : alert('먼저 저장해 주세요.'))}
          >
            🔑 세션 공유
          </button>
          <button className="btn primary" onClick={save}>저장</button>
        </div>

        {/* 편집 중에는 화면의 최신 내용을 그대로 넘겨, '갱신' 이 현재 원고를 반영하게 한다. */}
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
            <input type="date" className="input" value={editing.date}
              onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
          </div>
        </div>

        <div className="split">
          <div>
            <div className="pane-label">마크다운</div>
            <textarea
              className="textarea"
              style={{ minHeight: '58vh', fontFamily: 'ui-monospace, Consolas, monospace' }}
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
          </div>
          <div>
            <div className="pane-label">미리보기</div>
            <div className="card md" style={{ minHeight: '58vh' }}
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        <div className="field" style={{ marginTop: 14, maxWidth: 400 }}>
          <label>태그</label>
          <input className="input" value={editing.tags.join(', ')}
            onChange={(e) => setEditing({ ...editing, tags: parseTags(e.target.value) })} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>📊 회의 준비자료</h1>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEditing(blank(member!.uid, member!.displayName))}>
          + 준비자료
        </button>
      </div>
      <p className="page-sub">
        마크다운으로 쓰고, 단일 HTML 파일로 내보내거나 <b>세션 코드</b>를 발급해 공유하세요.
        코드를 받은 사람은 로그인 없이 그 자료만 볼 수 있습니다.
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
              <button className="btn sm" onClick={() => setEditing(p)}>편집</button>
              <button className="btn sm" onClick={() => openPreview(p)}>미리보기</button>
              <button className="btn sm" onClick={() => downloadHtml(p)}>HTML</button>
              <button className="btn sm" onClick={() => setSharing(p)}>🔑 세션</button>
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
