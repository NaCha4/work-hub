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
  morning: '- ',
  afternoon: '- ',
  overtime: '- ',
  blockers: '',
  tags: [] as string[],
  authorUid: author.uid,
  authorName: author.name,
  createdAt: 0,
  updatedAt: 0,
})

const toList = (items: string[]) => items.map((x) => `- ${x}`).join('\n')

function journalMorning(j: JournalEntry): string {
  return j.morning ?? j.done ?? ''
}

function openForEdit(j: JournalEntry): JournalEntry {
  return {
    ...j,
    morning: journalMorning(j),
    afternoon: j.afternoon ?? '',
    overtime: j.overtime ?? '',
  }
}

type WorkPeriod = 'morning' | 'afternoon' | 'overtime'

function periodAt(hour: number): WorkPeriod {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'overtime'
}

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
      [
        j.date,
        journalMorning(j),
        j.afternoon ?? '',
        j.overtime ?? '',
        j.blockers,
        ...j.tags,
      ].join(' ').toLowerCase().includes(k),
    )
  }, [items, q])

  /**
   * 새 일지를 빈 칸으로 열지 않는다. 완료한 할 일과 오늘 캘린더 회의를
   * 시각에 따라 오전·오후·야근 칸에 나눈다.
   * 어차피 편집 칸이라 지우고 고치면 그만이고, 빈 화면에서 기억을 더듬는 것보다 낫다.
   */
  function openNew() {
    const t = today()
    const byPeriod: Record<WorkPeriod, string[]> = {
      morning: [],
      afternoon: [],
      overtime: [],
    }
    tasks
      .filter((x) => x.status === 'done' && new Date(x.updatedAt).toDateString() === new Date().toDateString())
      .forEach((x) => {
        byPeriod[periodAt(new Date(x.updatedAt).getHours())].push(x.title)
      })
    cal.events
      .filter((e) => e.date === t && !e.allDay)
      .forEach((e) => {
        const hour = Number(e.time.slice(0, 2))
        byPeriod[periodAt(Number.isFinite(hour) ? hour : 0)].push(`회의: ${e.title}`)
      })

    setDraft({
      ...blank({ uid: member!.uid, name: member!.displayName }),
      morning: byPeriod.morning.length ? toList(byPeriod.morning) : '- ',
      afternoon: byPeriod.afternoon.length ? toList(byPeriod.afternoon) : '- ',
      overtime: byPeriod.overtime.length ? toList(byPeriod.overtime) : '- ',
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
            <button className="btn ghost sm" onClick={() => setDraft(openForEdit(j))}>편집</button>
            <button className="btn ghost sm danger" onClick={() => remove(j)}>삭제</button>
          </div>
          <div className="grid journal-sections">
            <Section title="오전" md={journalMorning(j)} />
            <Section title="오후" md={j.afternoon ?? ''} />
            <Section title="야근" md={j.overtime ?? ''} />
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
            label="오전"
            value={draft.morning}
            onChange={(v) => setDraft({ ...draft, morning: v })}
            placeholder={'- 사내 계정/장비 세팅\n- 팀 코드베이스 훑어보기'}
          />
          <MarkdownField
            label="오후"
            value={draft.afternoon}
            onChange={(v) => setDraft({ ...draft, afternoon: v })}
          />
          <MarkdownField
            label="야근"
            value={draft.overtime}
            onChange={(v) => setDraft({ ...draft, overtime: v })}
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
