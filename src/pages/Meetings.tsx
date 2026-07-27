import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DateInput from '../components/DateInput'
import Modal from '../components/Modal'
import MarkdownField from '../components/MarkdownField'
import { useAuth } from '../lib/auth'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { nowTime, renderMarkdown, today, withDow } from '../lib/markdown'
import type { Meeting } from '../lib/types'

/**
 * 회의 메모. 정식 회의록은 다른 곳에 쓰고 여기에는 자리에서 받아적는 것만 남긴다.
 *
 * 안건·결정 사항 칸과 태그는 화면에서 뺐지만 저장 형식은 그대로 둔다.
 * 이미 쌓인 문서를 건드리지 않기 위해서이고, 필드는 빈 값으로 채워 보낸다.
 */
const blank = (uid: string, name: string): Meeting => ({
  id: '',
  title: '',
  date: today(),
  time: nowTime(),
  place: '',
  attendees: [],
  agenda: '',
  notes: '',
  decisions: '',
  tags: [],
  authorUid: uid,
  authorName: name,
  createdAt: 0,
  updatedAt: 0,
})

export default function Meetings() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Meeting>('meetings', !!member, byDate)
  const loc = useLocation()
  const [draft, setDraft] = useState<Meeting | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  // 통합 검색에서 넘어오면 그 메모를 펼치고 검색어를 걸어둔다.
  useEffect(() => {
    const s = loc.state as { q?: string; open?: string } | null
    if (s?.q) setQ(s.q)
    if (s?.open) setOpenId(s.open)
  }, [loc.state])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return items
    return items.filter((m) =>
      [m.title, m.date, m.place, m.notes, ...m.attendees].join(' ').toLowerCase().includes(k),
    )
  }, [items, q])

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) return alert('제목을 입력해 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('meetings', id, data)
    else await createDoc('meetings', data)
    setDraft(null)
  }

  async function remove(m: Meeting) {
    if (!confirm(`"${m.title}" 메모를 삭제할까요?`)) return
    await deleteDocById('meetings', m.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>회의 메모</h1>
        <span className="spacer" />
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" onClick={() => setDraft(blank(member!.uid, member!.displayName))}>
          + 메모
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}
      {!loading && filtered.length === 0 && <div className="empty">아직 메모가 없습니다.</div>}

      {filtered.map((m) => {
        const open = openId === m.id
        return (
          <div className="card" key={m.id}>
            <div className="card-head">
              <h3 style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? null : m.id)}>
                {open ? '▾' : '▸'} {m.title}
              </h3>
              <span className="muted" style={{ fontSize: 12 }}>
                {withDow(m.date)} {m.time} {m.place && `· ${m.place}`}
              </span>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={() => setDraft(m)}>편집</button>
              <button className="btn ghost sm danger" onClick={() => remove(m)}>삭제</button>
            </div>
            {m.attendees.length > 0 && (
              <div className="muted" style={{ fontSize: 12.5 }}>참석: {m.attendees.join(', ')}</div>
            )}
            {open && <Body md={m.notes} />}
          </div>
        )
      })}

      {draft && (
        <Modal
          title={draft.id ? '메모 편집' : '새 회의 메모'}
          onClose={() => setDraft(null)}
          onSubmit={save}
        >
          <div className="field">
            <label>제목</label>
            <input
              className="input"
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="예) 주간 팀 싱크"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>날짜</label>
              <DateInput value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
            </div>
            <div className="field">
              <label>시간</label>
              <DateInput type="time" value={draft.time} onChange={(v) => setDraft({ ...draft, time: v })} />
            </div>
            <div className="field">
              <label>장소</label>
              <input className="input" value={draft.place} placeholder="회의실 A / 화상"
                onChange={(e) => setDraft({ ...draft, place: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>참석자 (쉼표 구분)</label>
            <input
              className="input"
              value={draft.attendees.join(', ')}
              onChange={(e) =>
                setDraft({ ...draft, attendees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
            />
          </div>
          <MarkdownField
            label="메모"
            value={draft.notes}
            rows={14}
            placeholder={'받아적는 칸입니다. 목록이나 강조는 마크다운으로 쓸 수 있습니다.'}
            onChange={(v) => setDraft({ ...draft, notes: v })}
          />
        </Modal>
      )}
    </div>
  )
}

function Body({ md }: { md: string }) {
  const html = renderMarkdown(md)
  if (!html) return <p className="muted" style={{ marginBottom: 0 }}>내용이 없습니다.</p>
  return <div className="md" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: html }} />
}
