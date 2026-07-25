import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import MarkdownField from '../components/MarkdownField'
import { useAuth } from '../lib/auth'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { nowTime, parseTags, renderMarkdown, today } from '../lib/markdown'
import type { Meeting, Prep, Task } from '../lib/types'

const TEMPLATE_AGENDA = `1. 지난 액션 아이템 점검
2.
3. 기타 논의`

const blank = (uid: string, name: string): Meeting => ({
  id: '',
  title: '',
  date: today(),
  time: nowTime(),
  place: '',
  attendees: [],
  agenda: TEMPLATE_AGENDA,
  notes: '',
  decisions: '',
  tags: [],
  authorUid: uid,
  authorName: name,
  createdAt: 0,
  updatedAt: 0,
})

/** 논의 내용에서 "- [ ] 할 일" 형태를 액션 아이템으로 뽑아낸다. */
function extractActionItems(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s*\[\s?\]\s*(.+)$/)?.[1]?.trim())
    .filter((x): x is string => !!x)
}

export default function Meetings() {
  const { member } = useAuth()
  const nav = useNavigate()
  const { items, loading, error } = useCollection<Meeting>('meetings', !!member, byDate)
  const { items: tasks } = useCollection<Task>('tasks', !!member)
  const [draft, setDraft] = useState<Meeting | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return items
    return items.filter((m) =>
      [m.title, m.agenda, m.notes, m.decisions, ...m.attendees, ...m.tags]
        .join(' ').toLowerCase().includes(k),
    )
  }, [items, q])

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) return alert('회의 제목을 입력해 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('meetings', id, data)
    else await createDoc('meetings', data)
    setDraft(null)
  }

  /** 회의록의 체크박스 항목을 할 일로 등록한다 (이미 등록된 것은 건너뜀). */
  async function syncActionItems(m: Meeting) {
    const found = extractActionItems(`${m.notes}\n${m.decisions}`)
    if (found.length === 0) return alert('“- [ ] 내용” 형식의 액션 아이템이 없습니다.')
    const existing = new Set(tasks.filter((t) => t.meetingId === m.id).map((t) => t.title))
    const fresh = found.filter((t) => !existing.has(t))
    if (fresh.length === 0) return alert('이미 모두 할 일로 등록되어 있습니다.')
    await Promise.all(
      fresh.map((title, i) =>
        createDoc('tasks', {
          title,
          notes: `회의 「${m.title}」(${m.date})에서 파생`,
          status: 'todo',
          priority: 'normal',
          due: '',
          project: m.title,
          tags: m.tags,
          meetingId: m.id,
          assigneeUid: member!.uid,
          assigneeName: member!.displayName,
          order: Date.now() + i,
        }),
      ),
    )
    if (confirm(`${fresh.length}건을 할 일로 등록했습니다. 할 일 화면으로 이동할까요?`)) {
      nav('/tasks')
    }
  }

  /** 회의록을 바탕으로 준비자료 초안을 만든다. */
  async function toPrep(m: Meeting) {
    const content = [
      '## 안건', m.agenda, '', '## 논의 내용', m.notes, '', '## 결정 사항', m.decisions,
    ].join('\n')
    const data: Omit<Prep, 'id' | 'createdAt' | 'updatedAt'> = {
      title: `${m.title} — 공유자료`,
      subtitle: `${m.date} 회의 정리`,
      date: m.date,
      meetingId: m.id,
      content,
      theme: 'light',
      tags: m.tags,
      authorUid: member!.uid,
      authorName: member!.displayName,
    }
    await createDoc('preps', data)
    nav('/preps')
  }

  async function remove(m: Meeting) {
    if (!confirm(`"${m.title}" 회의록을 삭제할까요?`)) return
    await deleteDocById('meetings', m.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>🗣️ 회의록</h1>
        <span className="spacer" />
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" onClick={() => setDraft(blank(member!.uid, member!.displayName))}>
          + 회의록
        </button>
      </div>
      <p className="page-sub">
        논의 내용에 <code>- [ ] 내용</code> 으로 적어두면 액션 아이템을 할 일로 옮길 수 있습니다.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}
      {!loading && filtered.length === 0 && <div className="empty">아직 회의록이 없습니다.</div>}

      {filtered.map((m) => {
        const open = openId === m.id
        const actions = extractActionItems(`${m.notes}\n${m.decisions}`)
        return (
          <div className="card" key={m.id}>
            <div className="card-head">
              <h3
                style={{ cursor: 'pointer' }}
                onClick={() => setOpenId(open ? null : m.id)}
              >
                {open ? '▾' : '▸'} {m.title}
              </h3>
              <span className="muted" style={{ fontSize: 12 }}>
                {m.date} {m.time} {m.place && `· ${m.place}`}
              </span>
              <span className="spacer" />
              {actions.length > 0 && (
                <span className="chip status-todo">액션 {actions.length}</span>
              )}
              <button className="btn ghost sm" onClick={() => setDraft(m)}>편집</button>
              <button className="btn ghost sm danger" onClick={() => remove(m)}>삭제</button>
            </div>
            {m.attendees.length > 0 && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                참석: {m.attendees.join(', ')}
              </div>
            )}
            {open && (
              <>
                <div className="grid cols-2" style={{ marginTop: 10 }}>
                  <Block title="안건" md={m.agenda} />
                  <Block title="논의 내용" md={m.notes} />
                </div>
                <Block title="결정 사항" md={m.decisions} />
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn sm" onClick={() => syncActionItems(m)}>
                    액션 아이템 → 할 일
                  </button>
                  <button className="btn sm" onClick={() => toPrep(m)}>
                    준비자료로 복사
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}

      {draft && (
        <Modal
          title={draft.id ? '회의록 편집' : '새 회의록'}
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
              <input type="date" className="input" value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div className="field">
              <label>시간</label>
              <input type="time" className="input" value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
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
          <MarkdownField label="안건" value={draft.agenda} rows={5}
            onChange={(v) => setDraft({ ...draft, agenda: v })} />
          <MarkdownField
            label="논의 내용"
            value={draft.notes}
            rows={9}
            placeholder={'- 논의한 내용\n- [ ] 담당자가 해야 할 일 (체크박스는 할 일로 옮길 수 있음)'}
            onChange={(v) => setDraft({ ...draft, notes: v })}
          />
          <MarkdownField label="결정 사항" value={draft.decisions} rows={4}
            onChange={(v) => setDraft({ ...draft, decisions: v })} />
          <div className="field">
            <label>태그</label>
            <input className="input" value={draft.tags.join(', ')}
              onChange={(e) => setDraft({ ...draft, tags: parseTags(e.target.value) })} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function Block({ title, md }: { title: string; md: string }) {
  const html = renderMarkdown(md)
  if (!html) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
        {title}
      </div>
      <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
