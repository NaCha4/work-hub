import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DateInput from '../components/DateInput'
import Modal from '../components/Modal'
import MarkdownField from '../components/MarkdownField'
import { useAuth } from '../lib/auth'
import { useCalendarEvents } from '../lib/calendar'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { parseTags, renderMarkdown, today, withDow } from '../lib/markdown'
import type { Journal as JournalEntry, Task } from '../lib/types'

const blank = (author: { uid: string; name: string }) => ({
  id: '',
  date: today(),
  done: '- ',
  next: '- ',
  blockers: '',
  tags: [] as string[],
  authorUid: author.uid,
  authorName: author.name,
  createdAt: 0,
  updatedAt: 0,
})

/** "- 항목" 마크다운 목록을 항목 문자열들로 푼다. 빈 줄과 빈 대시는 버린다. */
function listItems(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*(\[.\]\s*)?/, '').trim())
    .filter(Boolean)
}

const toList = (items: string[]) => items.map((x) => `- ${x}`).join('\n')

export default function Journal() {
  const { member } = useAuth()
  const loc = useLocation()
  const { items, loading, error } = useCollection<JournalEntry>('journals', !!member, byDate)
  const { items: tasks } = useCollection<Task>('tasks', !!member)
  const cal = useCalendarEvents(today().slice(0, 7))
  const [draft, setDraft] = useState<JournalEntry | null>(null)
  const [q, setQ] = useState('')

  // 통합 검색에서 넘어오면 그 검색어가 걸린 채로 열린다.
  useEffect(() => {
    const s = loc.state as { q?: string } | null
    if (s?.q) setQ(s.q)
  }, [loc.state])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return items
    return items.filter((j) =>
      [j.date, j.done, j.next, j.blockers, ...j.tags].join(' ').toLowerCase().includes(k),
    )
  }, [items, q])

  /**
   * 새 일지를 빈 칸으로 열지 않는다. 오늘 한 일은 이미 앱이 알고 있다.
   *  - 한 일: 오늘 완료 처리한 할 일 + 오늘 캘린더 회의
   *  - 다음 할 일: 어제 일지의 계획 중 아직 완료되지 않은 것 (자동 이월)
   * 어차피 편집 칸이라 지우고 고치면 그만이고, 빈 화면에서 기억을 더듬는 것보다 낫다.
   */
  function openNew() {
    const t = today()
    const doneToday = tasks
      .filter((x) => x.status === 'done' && new Date(x.updatedAt).toDateString() === new Date().toDateString())
      .map((x) => x.title)
    const meetings = cal.events
      .filter((e) => e.date === t && !e.allDay)
      .map((e) => `회의: ${e.title}`)
    const yesterday = items.find((j) => j.date < t)
    const carried = yesterday
      ? listItems(yesterday.next).filter((x) => !doneToday.includes(x))
      : []

    const done = [...doneToday, ...meetings]
    setDraft({
      ...blank({ uid: member!.uid, name: member!.displayName }),
      done: done.length ? toList(done) : '- ',
      next: carried.length ? toList(carried) : '- ',
    } as JournalEntry)
  }

  async function save() {
    if (!draft) return
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('journals', id, data)
    else await createDoc('journals', data)
    setDraft(null)
  }

  async function remove(j: JournalEntry) {
    if (!confirm(`${j.date} 일지를 삭제할까요?`)) return
    await deleteDocById('journals', j.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>업무 일지</h1>
        <span className="spacer" />
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" onClick={openNew}>+ 오늘 일지</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}
      {!loading && filtered.length === 0 && (
        <div className="empty">
          아직 작성한 일지가 없습니다. <b>+ 오늘 일지</b> 로 첫 기록을 남겨보세요.
        </div>
      )}

      {filtered.map((j) => (
        <div className="card" key={j.id}>
          <div className="card-head">
            <h3>{withDow(j.date)}</h3>
            <span className="muted" style={{ fontSize: 12 }}>{j.authorName}</span>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setDraft(j)}>편집</button>
            <button className="btn ghost sm danger" onClick={() => remove(j)}>삭제</button>
          </div>
          <div className="grid cols-3">
            <Section title="한 일" md={j.done} />
            <Section title="다음 할 일" md={j.next} />
            <Section title="이슈" md={j.blockers} />
          </div>
          {j.tags.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {j.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}
            </div>
          )}
        </div>
      ))}

      {draft && (
        <Modal
          title={draft.id ? '일지 편집' : '새 업무 일지'}
          onClose={() => setDraft(null)}
          onSubmit={save}
        >
          <div className="field" style={{ maxWidth: 160 }}>
            <label>날짜</label>
            <DateInput value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
          </div>
          <MarkdownField
            label="오늘 한 일"
            value={draft.done}
            onChange={(v) => setDraft({ ...draft, done: v })}
            placeholder={'- 사내 계정/장비 세팅\n- 팀 코드베이스 훑어보기'}
          />
          <MarkdownField
            label="다음 할 일"
            value={draft.next}
            onChange={(v) => setDraft({ ...draft, next: v })}
          />
          <MarkdownField
            label="이슈 / 막힌 것"
            value={draft.blockers}
            onChange={(v) => setDraft({ ...draft, blockers: v })}
            rows={4}
          />
          <div className="field">
            <label>태그 (쉼표 또는 공백 구분)</label>
            <input
              className="input"
              value={draft.tags.join(', ')}
              onChange={(e) => setDraft({ ...draft, tags: parseTags(e.target.value) })}
              placeholder="온보딩, 개발환경"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

function Section({ title, md }: { title: string; md: string }) {
  const html = renderMarkdown(md)
  return (
    <div>
      <div className="pane-label" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
        {title}
      </div>
      {html ? (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="muted" style={{ margin: 0 }}>—</p>
      )}
    </div>
  )
}
