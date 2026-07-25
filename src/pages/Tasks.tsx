import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import MarkdownField from '../components/MarkdownField'
import { useAuth } from '../lib/auth'
import { createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { parseTags, today } from '../lib/markdown'
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../lib/types'

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'doing', 'review', 'done']
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']

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

export default function Tasks() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Task>('tasks', !!member)
  const [draft, setDraft] = useState<Task | null>(null)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
  const [project, setProject] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const projects = useMemo(
    () => [...new Set(items.map((t) => t.project).filter(Boolean))].sort(),
    [items],
  )

  const visible = useMemo(
    () =>
      items
        .filter((t) => !project || t.project === project)
        .filter((t) => !mineOnly || t.assigneeUid === member?.uid)
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
    [items, project, mineOnly, member],
  )

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) return alert('제목을 입력해 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('tasks', id, data)
    else await createDoc('tasks', data)
    setDraft(null)
  }

  async function move(taskId: string, status: TaskStatus) {
    await updateDocById('tasks', taskId, { status })
  }

  async function remove(t: Task) {
    if (!confirm(`"${t.title}" 를 삭제할까요?`)) return
    await deleteDocById('tasks', t.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>할 일</h1>
        <span className="spacer" />
        <select className="select" style={{ width: 150 }} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">전체 프로젝트</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          내 것만
        </label>
        <button className="btn primary" onClick={() => setDraft(blank(member!.uid, member!.displayName))}>
          + 할 일
        </button>
      </div>
      <p className="page-sub">카드를 다른 칸으로 끌어다 놓으면 상태가 바뀝니다.</p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}

      <div className="board">
        {COLUMNS.map((col) => {
          const list = visible.filter((t) => t.status === col)
          return (
            <div
              key={col}
              className={`board-col${dragOver === col ? ' drop' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col) }}
              onDragLeave={() => setDragOver((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                const id = e.dataTransfer.getData('text/plain')
                if (id) void move(id, col)
              }}
            >
              <h4>
                <span>{TASK_STATUS_LABEL[col]}</span>
                <span>{list.length}</span>
              </h4>
              {list.map((t) => (
                <div
                  className="task-card"
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                  onClick={() => setDraft(t)}
                >
                  <div className="t">{t.title}</div>
                  <div className="m">
                    <span className={`prio-${t.priority}`}>{TASK_PRIORITY_LABEL[t.priority]}</span>
                    {t.due && (
                      <span
                        className={`due${t.due < today() && t.status !== 'done' ? ' overdue' : ''}`}
                      >
                        <Icon name="calendar" size={12} />
                        {t.due.slice(5)}
                      </span>
                    )}
                    {t.project && <span>· {t.project}</span>}
                  </div>
                  {t.tags.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {t.tags.map((x) => <span className="tag" key={x}>#{x}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
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
                {COLUMNS.map((c) => <option key={c} value={c}>{TASK_STATUS_LABEL[c]}</option>)}
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
              <input
                type="date"
                className="input"
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
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
