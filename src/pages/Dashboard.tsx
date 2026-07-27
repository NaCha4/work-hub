import { useMemo, useState } from 'react'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import MarkdownField from '../components/MarkdownField'
import Modal from '../components/Modal'
import MonthCalendar from '../components/MonthCalendar'
import { useAuth } from '../lib/auth'
import { useCalendarEvents } from '../lib/calendar'
import { createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { dday, parseTags, today } from '../lib/markdown'
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Journal,
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
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const cal = useCalendarEvents(month)
  const [draft, setDraft] = useState<Task | null>(null)
  const [project, setProject] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)

  const t = today()
  const projects = useMemo(
    () => [...new Set(tasks.map((x) => x.project).filter(Boolean))].sort(),
    [tasks],
  )
  const inProject = tasks.filter((x) => !project || x.project === project)
  const open = inProject.filter((x) => x.status !== 'done')
  // 달력은 구글 캘린더만 비춘다. 회의 메모는 받아적는 곳이지 일정이 아니라서
  // 여기 올리면 실제 일정과 섞여 무엇이 약속인지 알 수 없게 된다.
  const agenda = cal.events.map((e) => ({
    key: `g-${e.id}`,
    date: e.date,
    time: e.time,
    title: e.title,
    link: e.link,
    color: e.color,
  }))

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const colTasks = (status: TaskStatus) =>
    inProject.filter((x) => x.status === status).sort((a, b) => (b.order ?? 0) - (a.order ?? 0))

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

  /** 칸의 빈 곳에 놓으면 그 칸 맨 아래로 간다. */
  async function dropOnColumn(status: TaskStatus) {
    const id = dragId
    setDragId(null)
    setOverCol(null)
    if (!id) return
    const rest = colTasks(status).filter((x) => x.id !== id)
    const order = rest.length ? (rest[rest.length - 1].order ?? 0) - 2048 : Date.now()
    await updateDocById('tasks', id, { status, order })
  }

  /**
   * 카드 위에 놓으면 그 카드 앞자리에 끼워 넣는다. 앞뒤 order 사이 값을 주므로
   * 나머지 카드는 건드리지 않고 쓰기도 한 번이다.
   */
  async function dropOnCard(target: Task) {
    const id = dragId
    setDragId(null)
    setOverCol(null)
    if (!id || id === target.id) return
    const rest = colTasks(target.status).filter((x) => x.id !== id)
    const at = rest.findIndex((x) => x.id === target.id)
    if (at < 0) return
    const above = at === 0 ? (target.order ?? 0) + 2048 : (rest[at - 1].order ?? 0)
    await updateDocById('tasks', id, {
      status: target.status,
      order: (above + (target.order ?? 0)) / 2,
    })
  }

  /** 최근 7일 일지를 주간 보고 초안으로 합친다. */
  const weekly = useMemo(() => {
    const since = daysAgo(7)
    const mine = journals
      .filter((j) => j.date >= since && j.authorUid === member?.uid)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (mine.length === 0) return ''
    const done = mine.map((j) => `### ${j.date}\n${j.done}`).join('\n\n')
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>할 일</h3>
          <span className="muted" style={{ fontSize: 12 }}>{open.length}</span>
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
        <p className="board-hint">카드를 다른 칸으로 끌어다 놓으면 상태가 바뀝니다. 카드를 누르면 편집합니다.</p>
        <div className="board">
          {STATUSES.map((col) => {
            const list = colTasks(col)
            // 완료는 계속 쌓이기만 한다. 접어두어도 칸 자체는 남아 드래그로 완료 처리된다.
            const folded = col === 'done' && !doneOpen
            return (
              <div
                key={col}
                className={`board-col${overCol === col ? ' drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col) }}
                onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
                onDrop={(e) => { e.preventDefault(); void dropOnColumn(col) }}
              >
                <h4>
                  <span>{TASK_STATUS_LABEL[col]}</span>
                  {col === 'done' ? (
                    <button className="col-fold" onClick={() => setDoneOpen((o) => !o)}>
                      {list.length} {folded ? '펼치기' : '접기'}
                    </button>
                  ) : (
                    <span>{list.length}</span>
                  )}
                </h4>
                {(folded ? [] : list).map((x) => (
                  <div
                    className={`task-card${dragId === x.id ? ' dragging' : ''}`}
                    key={x.id}
                    draggable
                    onClick={() => setDraft(x)}
                    onDragStart={() => setDragId(x.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    // 카드에 놓으면 그 앞자리다. 칸까지 올라가면 맨 아래로 가버린다.
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void dropOnCard(x) }}
                  >
                    <div className="t">{x.title}</div>
                    <div className="m">
                      <span className={`prio-${x.priority}`}>{TASK_PRIORITY_LABEL[x.priority]}</span>
                      {x.due && (
                        <span className={`due${x.due < t && x.status !== 'done' ? ' overdue' : ''}`}>
                          <Icon name="calendar" size={12} />
                          {x.due.slice(5)}
                          {x.status !== 'done' && <b className="dday">{dday(x.due, t)}</b>}
                        </span>
                      )}
                      {x.project && <span>· {x.project}</span>}
                    </div>
                    {x.tags.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {x.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <MonthCalendar
        month={month}
        today={t}
        items={agenda}
        onShift={shiftMonth}
        onToday={() => setMonth(t.slice(0, 7))}
        status={
          /* 네 상태가 전부 화면에 드러나야 한다. 조용히 아무것도 안 뜨면
             연동이 꺼진 것인지 일정이 없는 것인지 구분할 방법이 없다. */
          <>
            {cal.state === 'off' && <span className="cal-note">캘린더 연동 꺼짐</span>}
            {cal.state === 'loading' && <span className="cal-note">캘린더 확인 중…</span>}
            {cal.state === 'ready' && cal.events.length === 0 && (
              <span className="cal-note">이 달 캘린더 일정 없음</span>
            )}
            {cal.state === 'error' && (
              <>
                <span className="cal-note">{cal.error}</span>
                <button className="btn ghost sm" onClick={cal.connect}>연동</button>
              </>
            )}
          </>
        }
      />

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

