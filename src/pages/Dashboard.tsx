import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import MarkdownField from '../components/MarkdownField'
import Modal from '../components/Modal'
import { useAuth } from '../lib/auth'
import { createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { parseTags, today } from '../lib/markdown'
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Journal,
  type Meeting,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../lib/types'

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'doing', 'review', 'done']
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const blank = (uid: string, name: string): Task => ({
  id: '',
  title: '',
  notes: '',
  status: 'todo',
  priority: 'normal',
  due: '',
  project: '',
  tags: [],
  assigneeUid: uid,
  assigneeName: name,
  order: Date.now(),
  createdAt: 0,
  updatedAt: 0,
})

export default function Dashboard() {
  const { member } = useAuth()
  const enabled = !!member
  const { items: tasks, error } = useCollection<Task>('tasks', enabled)
  const { items: journals } = useCollection<Journal>('journals', enabled)
  const { items: meetings } = useCollection<Meeting>('meetings', enabled)
  const [draft, setDraft] = useState<Task | null>(null)
  const [project, setProject] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const t = today()
  const projects = useMemo(
    () => [...new Set(tasks.map((x) => x.project).filter(Boolean))].sort(),
    [tasks],
  )
  const inProject = tasks.filter((x) => !project || x.project === project)
  const open = inProject.filter((x) => x.status !== 'done')
  const upcoming = meetings.filter((m) => m.date >= t).sort((a, b) => a.date.localeCompare(b.date))
  const wroteToday = journals.some((j) => j.date === t && j.authorUid === member?.uid)

  // 상태로 나누지 않고 한 줄로 세운다. 순서는 order 가 정하고 드래그로 바꾼다.
  const ordered = [...open].sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
  const finished = inProject
    .filter((x) => x.status === 'done')
    .sort((a, b) => b.updatedAt - a.updatedAt)

  /** 체크 한 번으로 완료·되돌리기. 목록을 벗어나지 않고 처리한다. */
  async function toggleDone(x: Task) {
    await updateDocById('tasks', x.id, { status: x.status === 'done' ? 'todo' : 'done' })
  }

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) return alert('제목을 입력해 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('tasks', id, data)
    else await createDoc('tasks', data)
    setDraft(null)
  }

  async function remove(x: Task) {
    if (!confirm(`"${x.title}" 를 삭제할까요?`)) return
    await deleteDocById('tasks', x.id)
  }

  /**
   * 놓인 자리의 앞뒤 order 사이 값을 준다. 나머지 카드의 order 는 건드리지 않으므로
   * 순서를 바꿔도 쓰기는 한 번이다.
   */
  async function dropOn(targetId: string) {
    const id = dragId
    setDragId(null)
    setOverId(null)
    if (!id || id === targetId) return
    const from = ordered.findIndex((x) => x.id === id)
    const to = ordered.findIndex((x) => x.id === targetId)
    if (from < 0 || to < 0) return
    const rest = ordered.filter((x) => x.id !== id)
    // 아래로 끌었으면 target 다음 자리, 위로 끌었으면 target 앞자리다.
    const at = rest.findIndex((x) => x.id === targetId) + (from < to ? 1 : 0)
    const above = at === 0 ? (rest[0].order ?? 0) + 2048 : (rest[at - 1].order ?? 0)
    const below =
      at >= rest.length ? (rest[rest.length - 1].order ?? 0) - 2048 : (rest[at].order ?? 0)
    await updateDocById('tasks', id, { order: (above + below) / 2 })
  }

  function row(x: Task, movable: boolean) {
    const over = movable && !!dragId && dragId !== x.id && overId === x.id
    const after =
      over && ordered.findIndex((y) => y.id === dragId) < ordered.findIndex((y) => y.id === x.id)
    const cls = [
      'task-row',
      movable ? 'movable' : 'dim',
      dragId === x.id ? 'dragging' : '',
      over ? (after ? 'drop-after' : 'drop-before') : '',
    ]
    return (
      <div
        key={x.id}
        className={cls.filter(Boolean).join(' ')}
        draggable={movable}
        onClick={() => setDraft(x)}
        onDragStart={() => setDragId(x.id)}
        onDragEnd={() => { setDragId(null); setOverId(null) }}
        onDragOver={movable ? (e) => { e.preventDefault(); setOverId(x.id) } : undefined}
        onDrop={movable ? (e) => { e.preventDefault(); void dropOn(x.id) } : undefined}
      >
        <input
          type="checkbox"
          checked={x.status === 'done'}
          onClick={(e) => e.stopPropagation()}
          onChange={() => void toggleDone(x)}
          aria-label={`${x.title} 완료`}
        />
        <span className={`chip status-${x.status}`}>{TASK_STATUS_LABEL[x.status]}</span>
        <span className="t">{x.title}</span>
        {x.priority !== 'normal' && (
          <span className={`sub prio-${x.priority}`}>{TASK_PRIORITY_LABEL[x.priority]}</span>
        )}
        {x.project && <span className="sub muted">{x.project}</span>}
        {x.due && (
          <span className={`sub due ${x.due < t && x.status !== 'done' ? 'overdue' : 'muted'}`}>
            <Icon name="calendar" size={12} />
            {x.due.slice(5)}
          </span>
        )}
      </div>
    )
  }

  /** 최근 7일 일지를 주간 보고 초안으로 합친다. */
  const weekly = useMemo(() => {
    const since = daysAgo(7)
    const mine = journals
      .filter((j) => j.date >= since && j.authorUid === member?.uid)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (mine.length === 0) return ''
    const done = mine.map((j) => `### ${j.date} ${j.title}\n${j.done}`).join('\n\n')
    const next = mine.at(-1)?.next ?? ''
    const issues = mine.map((j) => j.blockers).filter((x) => x.trim()).join('\n')
    return [
      `# 주간 업무 보고 (${since} ~ ${t})`,
      '\n## 이번 주 한 일\n', done,
      '\n## 다음 주 계획\n', next,
      issues ? `\n## 이슈\n${issues}` : '',
    ].join('\n')
  }, [journals, member, t])

  async function copyWeekly() {
    if (!weekly) return alert('최근 7일간 작성한 일지가 없습니다.')
    await navigator.clipboard.writeText(weekly)
    alert('주간 보고 초안을 클립보드에 복사했습니다.')
  }

  return (
    <div className="page">
      <div className="page-head">
        {/* 쓰는 사람이 한 명이라 계정 표시 이름을 따라가지 않는다. AGENTS.md 2.1 참고 */}
        <h1>안녕하세요, 도코님</h1>
        <span className="spacer" />
        <button className="btn sm" onClick={copyWeekly}>주간 보고 초안 복사</button>
      </div>
      <p className="page-sub">{t}</p>

      {error && <div className="error-banner">{error}</div>}

      {!wroteToday && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 12 }}>
          오늘 업무 일지를 아직 안 썼습니다. <Link to="/journal">지금 작성하기 →</Link>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>할 일</h3>
          <span className="muted" style={{ fontSize: 12 }}>{ordered.length}</span>
          <span className="spacer" />
          <select
            className="select"
            style={{ width: 150 }}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">전체 프로젝트</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            className="btn primary sm"
            onClick={() => setDraft(blank(member!.uid, member!.displayName))}
          >
            + 할 일
          </button>
        </div>
        {ordered.length === 0 && <p className="muted">남은 할 일이 없습니다.</p>}
        {ordered.map((x) => row(x, true))}

        {/* 완료가 쌓이면 화면이 한없이 길어진다. 기본은 접어 두고 필요할 때만 편다. */}
        {finished.length > 0 && (
          <details className="done-fold">
            <summary>완료 {finished.length}</summary>
            {finished.map((x) => row(x, false))}
          </details>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>다가오는 회의</h3></div>
        {upcoming.length === 0 && <p className="muted">예정된 회의가 없습니다.</p>}
        {upcoming.slice(0, 6).map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span className="muted" style={{ fontSize: 12.5, width: 92, flex: '0 0 92px' }}>
              {m.date.slice(5)} {m.time}
            </span>
            <span>{m.title}</span>
          </div>
        ))}
      </div>

      {draft && (
        <Modal
          title={draft.id ? '할 일 편집' : '새 할 일'}
          onClose={() => setDraft(null)}
          onSubmit={save}
          extraActions={
            draft.id ? (
              <button
                className="btn ghost danger"
                onClick={() => { void remove(draft); setDraft(null) }}
              >
                삭제
              </button>
            ) : undefined
          }
        >
          <div className="field">
            <label>제목</label>
            <input
              className="input"
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="예) 주간 보고 템플릿 정리"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>상태</label>
              <select
                className="select"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}
              >
                {STATUSES.map((c) => <option key={c} value={c}>{TASK_STATUS_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>우선순위</label>
              <select
                className="select"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>마감일</label>
              <DateInput value={draft.due} onChange={(v) => setDraft({ ...draft, due: v })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>프로젝트</label>
              <input
                className="input"
                list="wh-projects"
                value={draft.project}
                onChange={(e) => setDraft({ ...draft, project: e.target.value })}
              />
              <datalist id="wh-projects">
                {projects.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="field">
              <label>태그</label>
              <input
                className="input"
                value={draft.tags.join(', ')}
                onChange={(e) => setDraft({ ...draft, tags: parseTags(e.target.value) })}
              />
            </div>
          </div>
          <MarkdownField
            label="메모"
            value={draft.notes}
            onChange={(v) => setDraft({ ...draft, notes: v })}
            rows={5}
          />
        </Modal>
      )}
    </div>
  )
}

