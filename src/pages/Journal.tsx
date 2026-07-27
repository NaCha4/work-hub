import { useMemo, useState } from 'react'
import DateInput from '../components/DateInput'
import Modal from '../components/Modal'
import MarkdownField from '../components/MarkdownField'
import { useAuth } from '../lib/auth'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { parseTags, renderMarkdown, today, withDow } from '../lib/markdown'
import type { Journal as JournalEntry } from '../lib/types'

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

export default function Journal() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<JournalEntry>('journals', !!member, byDate)
  const [draft, setDraft] = useState<JournalEntry | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return items
    return items.filter((j) =>
      [j.date, j.done, j.next, j.blockers, ...j.tags].join(' ').toLowerCase().includes(k),
    )
  }, [items, q])

  const openNew = () =>
    setDraft(blank({ uid: member!.uid, name: member!.displayName }) as JournalEntry)

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
