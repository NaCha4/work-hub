import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useLocation } from 'react-router-dom'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { useAuth } from '../lib/auth'
import {
  createDoc,
  deleteDocById,
  deleteProjectCalendar,
  renameProjectCalendar,
  updateDocById,
  useCollection,
} from '../lib/db'
import { nowTime, today } from '../lib/markdown'
import {
  SCHEDULE_KIND_LABEL,
  TASK_PRIORITY_LABEL,
  type ProjectCalendar,
  type ProjectCalendarColor,
  type Schedule,
  type ScheduleKind,
  type Task,
} from '../lib/types'

const KINDS: ScheduleKind[] = ['personal', 'work', 'meeting', 'focus', 'deadline']
const PROJECT_COLORS: ProjectCalendarColor[] = ['clay', 'blue', 'green', 'violet', 'yellow', 'red']
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DAY_MS = 86400000

type View = 'month' | 'timeline'

function dateAt(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

function addDays(value: string, days: number) {
  const date = dateAt(value)
  date.setDate(date.getDate() + days)
  return ymd(date)
}

function daysBetween(from: string, to: string) {
  return Math.round((dateAt(to).getTime() - dateAt(from).getTime()) / DAY_MS)
}

function blank(uid: string, name: string, date = today(), task?: Task, project = ''): Schedule {
  return {
    id: '',
    title: task?.title ?? '',
    kind: task ? 'work' : 'personal',
    startDate: date,
    endDate: date,
    startTime: task ? '09:00' : nowTime(),
    endTime: task ? '10:00' : '',
    allDay: false,
    taskId: task?.id ?? '',
    project: task?.project || project,
    location: '',
    notes: '',
    authorUid: uid,
    authorName: name,
    createdAt: 0,
    updatedAt: 0,
  }
}

export default function SchedulePage() {
  const { member } = useAuth()
  const location = useLocation()
  const { items: schedules, loading, error } = useCollection<Schedule>('schedules', !!member)
  const { items: tasks } = useCollection<Task>('tasks', !!member)
  const { items: projectCalendars, error: projectError } = useCollection<ProjectCalendar>('scheduleProjects', !!member)
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [view, setView] = useState<View>('month')
  const [kind, setKind] = useState<ScheduleKind | ''>('')
  const [draft, setDraft] = useState<Schedule | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectCalendar | null>(null)
  const [spotlightProject, setSpotlightProject] = useState<string | null>(null)

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const projects = useMemo(() => {
    const values = schedules.map((item) => item.project)
      .concat(tasks.map((task) => task.project))
      .filter(Boolean)
    return [...new Set(values)].sort()
  }, [schedules, tasks])
  const projectMap = useMemo(
    () => new Map(projectCalendars.map((item) => [item.name, item])),
    [projectCalendars],
  )
  const calendarNames = useMemo(
    () => [...new Set(projectCalendars.map((item) => item.name).concat(projects))].sort(),
    [projectCalendars, projects],
  )
  const visible = useMemo(() => schedules.filter((item) => {
    if (kind && item.kind !== kind) return false
    return true
  }), [kind, schedules])
  const openTasks = tasks.filter((task) => task.status !== 'done')
  const scheduledTaskIds = new Set(schedules.map((item) => item.taskId).filter(Boolean))
  const unscheduled = openTasks.filter((task) => !scheduledTaskIds.has(task.id))
  const inMonth = visible.filter((item) => item.startDate.slice(0, 7) <= month && item.endDate.slice(0, 7) >= month)
  const workCount = inMonth.filter((item) => item.taskId || item.kind !== 'personal').length

  useEffect(() => {
    const state = location.state as { open?: string } | null
    const target = state?.open ? schedules.find((item) => item.id === state.open) : undefined
    if (target) {
      setMonth(target.startDate.slice(0, 7))
      setDraft(target)
    }
  }, [location.state, schedules])

  function shiftMonth(delta: number) {
    const [year, value] = month.split('-').map(Number)
    setMonth(ymd(new Date(year, value - 1 + delta, 1)).slice(0, 7))
  }

  function openNew(date = today(), task?: Task, project = '') {
    setDraft(blank(member!.uid, member!.displayName, date, task, project))
  }

  function newProject(): ProjectCalendar {
    return {
      id: '',
      name: '',
      color: PROJECT_COLORS[projectCalendars.length % PROJECT_COLORS.length],
      authorUid: member!.uid,
      authorName: member!.displayName,
      createdAt: 0,
      updatedAt: 0,
    }
  }

  async function saveProject() {
    if (!projectDraft) return
    const name = projectDraft.name.trim()
    if (!name) return alert('프로젝트 이름을 입력해 주세요.')
    if (projectCalendars.some((value) => value.name.toLowerCase() === name.toLowerCase())) {
      return alert('같은 이름의 프로젝트가 이미 있습니다.')
    }
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = { ...projectDraft, name }
    await createDoc('scheduleProjects', data)
    setProjectDraft(null)
  }

  async function changeProjectColor(name: string, color: ProjectCalendarColor, item?: ProjectCalendar) {
    if (item) {
      await updateDocById('scheduleProjects', item.id, { color })
      return
    }
    await createDoc('scheduleProjects', {
      name,
      color,
      authorUid: member!.uid,
      authorName: member!.displayName,
    })
  }

  async function removeProject(name: string, projectId?: string) {
    const linkedSchedules = schedules.filter((schedule) => schedule.project === name)
    const linkedTasks = tasks.filter((task) => task.project === name)
    const impact = linkedSchedules.length || linkedTasks.length
      ? `\n연결된 일정 ${linkedSchedules.length}개와 업무 ${linkedTasks.length}개는 삭제하지 않고 미지정으로 옮깁니다.`
      : ''
    if (!confirm(`"${name}" 프로젝트 캘린더를 삭제할까요?${impact}`)) return
    await deleteProjectCalendar(
      projectId,
      linkedSchedules.map((schedule) => schedule.id),
      linkedTasks.map((task) => task.id),
    )
  }

  async function renameProject(name: string, color: ProjectCalendarColor, item?: ProjectCalendar) {
    const nextName = prompt('새 프로젝트 이름을 입력해 주세요.', name)?.trim()
    if (!nextName || nextName === name) return
    if (calendarNames.some((value) => value !== name && value.toLowerCase() === nextName.toLowerCase())) {
      return alert('같은 이름의 프로젝트가 이미 있습니다.')
    }
    const linkedSchedules = schedules.filter((schedule) => schedule.project === name)
    const linkedTasks = tasks.filter((task) => task.project === name)
    await renameProjectCalendar(
      item?.id,
      linkedSchedules.map((schedule) => schedule.id),
      linkedTasks.map((task) => task.id),
      nextName,
      { color, authorUid: member!.uid, authorName: member!.displayName },
    )
    setSpotlightProject((current) => current === name ? nextName : current)
  }

  function selectProject(name: string) {
    setSpotlightProject((current) => current === name ? null : name)
  }

  function onTaskDrop(event: DragEvent, date: string) {
    event.preventDefault()
    const task = taskMap.get(event.dataTransfer.getData('text/task-id'))
    if (task) openNew(date, task)
  }

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) return alert('일정 제목을 입력해 주세요.')
    if (!draft.startDate || !draft.endDate) return alert('시작일과 종료일을 입력해 주세요.')
    if (draft.endDate < draft.startDate) return alert('종료일은 시작일보다 빠를 수 없습니다.')
    if (!draft.allDay && draft.startDate === draft.endDate && draft.endTime && draft.endTime <= draft.startTime) {
      return alert('종료 시간은 시작 시간보다 늦어야 합니다.')
    }
    const normalized = {
      ...draft,
      title: draft.title.trim(),
      project: draft.project.trim(),
      startTime: draft.allDay ? '' : draft.startTime,
      endTime: draft.allDay ? '' : draft.endTime,
    }
    const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = normalized
    if (id) await updateDocById('schedules', id, data)
    else await createDoc('schedules', data)
    setDraft(null)
  }

  async function remove(item: Schedule) {
    if (!confirm(`"${item.title}" 일정을 삭제할까요?`)) return
    await deleteDocById('schedules', item.id)
    setDraft(null)
  }

  return (
    <div className="page schedule-page">
      <div className="page-head schedule-head">
        <div>
          <h1>일정</h1>
          <p className="page-sub">개인 일정과 업무 시간을 함께 놓고, 업무별 흐름을 확인합니다.</p>
        </div>
        <span className="spacer" />
        <div className="schedule-view-switch" aria-label="보기 방식">
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>달력</button>
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>업무별</button>
        </div>
        <button className="btn primary" onClick={() => openNew()}>
          <span aria-hidden="true">+</span> 일정
        </button>
      </div>

      {(error || projectError) && <div className="error-banner">{error || projectError}</div>}

      <div className="schedule-stats">
        <Stat label="이번 달 일정" value={inMonth.length} />
        <Stat label="업무 일정" value={workCount} />
        <Stat label="미배정 업무" value={unscheduled.length} tone={unscheduled.length ? 'warn' : ''} />
      </div>

      <div className="schedule-toolbar card">
        <div className="schedule-month-nav">
          <button className="btn ghost sm" onClick={() => shiftMonth(-1)} aria-label="이전 달">
            <Icon name="chevron-left" />
          </button>
          <strong>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</strong>
          <button className="btn ghost sm" onClick={() => shiftMonth(1)} aria-label="다음 달">
            <Icon name="chevron-right" />
          </button>
          <button className="btn ghost sm" onClick={() => setMonth(today().slice(0, 7))}>오늘</button>
        </div>
        <span className="spacer" />
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind | '')}>
          <option value="">모든 구분</option>
          {KINDS.map((value) => <option value={value} key={value}>{SCHEDULE_KIND_LABEL[value]}</option>)}
        </select>
      </div>

      <div className="schedule-workspace">
        <section className="schedule-main">
          {loading ? <div className="empty">일정을 불러오는 중입니다.</div> : view === 'month' ? (
            <MonthView
              month={month}
              items={visible}
              onOpen={setDraft}
              onAdd={openNew}
              onTaskDrop={onTaskDrop}
              projectMap={projectMap}
              taskMap={taskMap}
              spotlightProject={spotlightProject}
            />
          ) : (
            <TimelineView
              month={month}
              items={visible}
              taskMap={taskMap}
              projectMap={projectMap}
              spotlightProject={spotlightProject}
              onOpen={setDraft}
            />
          )}
        </section>

        <aside className="schedule-side">
          <section className="schedule-calendars card">
            <div className="card-head">
              <h3>프로젝트 캘린더</h3>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={() => setProjectDraft(newProject())}>+ 프로젝트</button>
            </div>
            <div className="project-calendar-list">
              <ProjectCalendarRow
                name="개인 및 미지정"
                color="clay"
                count={schedules.filter((item) => !item.project).length}
                selected={spotlightProject === '__none__'}
                unfocused={spotlightProject !== null && spotlightProject !== '__none__'}
                onSelect={() => selectProject('__none__')}
                onAdd={() => openNew(today())}
              />
              {calendarNames.map((name) => {
                const calendar = projectMap.get(name)
                return (
                  <ProjectCalendarRow
                    key={name}
                    name={name}
                    color={calendar?.color ?? 'blue'}
                    count={schedules.filter((item) => item.project === name).length}
                    selected={spotlightProject === name}
                    unfocused={spotlightProject !== null && spotlightProject !== name}
                    onSelect={() => selectProject(name)}
                    onAdd={() => openNew(today(), undefined, name)}
                    onColor={(color) => changeProjectColor(name, color, calendar)}
                    onRename={() => renameProject(name, calendar?.color ?? 'blue', calendar)}
                    onRemove={() => removeProject(name, calendar?.id)}
                  />
                )
              })}
            </div>
          </section>

          <section className="schedule-backlog card">
          <div className="card-head">
            <h3>배정할 업무</h3>
            <span className="schedule-count">{unscheduled.length}</span>
          </div>
          <p>업무를 달력 날짜로 끌거나 눌러 일정을 잡습니다.</p>
          <div className="schedule-task-list">
            {unscheduled.length === 0 && <div className="schedule-task-empty">모든 업무에 일정이 있습니다.</div>}
            {unscheduled.map((task) => (
              <button
                className="schedule-task"
                key={task.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)}
                onClick={() => openNew(today(), task)}
              >
                <span className="schedule-task-title">{task.title}</span>
                <span className="schedule-task-meta">
                  <span className={`prio-${task.priority}`}>{TASK_PRIORITY_LABEL[task.priority]}</span>
                  {task.project && <span>{task.project}</span>}
                  {task.due && <span>마감 {task.due.slice(5)}</span>}
                </span>
              </button>
            ))}
          </div>
          </section>
        </aside>
      </div>

      {draft && (
        <ScheduleModal
          draft={draft}
          projects={calendarNames}
          onChange={setDraft}
          onSave={save}
          onRemove={draft.id ? () => remove(draft) : undefined}
          onClose={() => setDraft(null)}
        />
      )}
      {projectDraft && (
        <ProjectModal
          draft={projectDraft}
          onChange={setProjectDraft}
          onSave={saveProject}
          onClose={() => setProjectDraft(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`schedule-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>
}

function ProjectCalendarRow({ name, color, count, selected, unfocused, onSelect, onAdd, onColor, onRename, onRemove }: {
  name: string
  color: ProjectCalendarColor
  count: number
  selected: boolean
  unfocused: boolean
  onSelect: () => void
  onAdd: () => void
  onColor?: (color: ProjectCalendarColor) => void
  onRename?: () => void
  onRemove?: () => void
}) {
  const [context, setContext] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!context) return
    const close = () => setContext(null)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [context])

  function openContext(event: ReactMouseEvent) {
    if (!onRemove && !onColor && !onRename) return
    event.preventDefault()
    setContext({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 194)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 172)),
    })
  }

  return (
    <div
      className={`project-calendar-row${selected ? ' selected' : ''}${unfocused ? ' unfocused' : ''}`}
      onContextMenu={openContext}
      title={onRemove || onColor || onRename ? '우클릭하여 프로젝트 관리' : undefined}
    >
      <button className="project-calendar-toggle" onClick={onSelect} aria-pressed={selected}>
        <span className={`project-calendar-dot project-${color}`} />
        <span className="project-calendar-name">{name}</span>
        <span className="project-calendar-count">{count}</span>
      </button>
      <button className="project-calendar-add" onClick={onAdd} title={`${name} 일정 추가`} aria-label={`${name} 일정 추가`}>+</button>
      {context && (onColor || onRename || onRemove) && (
        <div
          className="project-context-menu"
          role="menu"
          style={{ left: context.x, top: context.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {onColor && (
            <>
              <span className="project-context-label">색상 변경</span>
              <div className="project-context-colors">
                {PROJECT_COLORS.map((value) => (
                  <button
                    className={`project-context-color project-${value}${color === value ? ' active' : ''}`}
                    key={value}
                    role="menuitem"
                    title={colorLabel(value)}
                    aria-label={`${colorLabel(value)}으로 변경`}
                    onClick={() => {
                      setContext(null)
                      onColor(value)
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {onRename && (
            <button
              className="project-context-action"
              role="menuitem"
              onClick={() => {
                setContext(null)
                onRename()
              }}
            >
              프로젝트 이름 변경
            </button>
          )}
          {onRemove && (
            <button
              className="project-context-delete"
              role="menuitem"
              onClick={() => {
                setContext(null)
                onRemove()
              }}
            >
              프로젝트 삭제
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function colorLabel(color: ProjectCalendarColor) {
  const labels: Record<ProjectCalendarColor, string> = {
    clay: '갈색', blue: '파랑', green: '초록', violet: '보라', yellow: '노랑', red: '빨강',
  }
  return labels[color]
}

function scheduleTone(item: Schedule, projectMap: Map<string, ProjectCalendar>) {
  const color = item.project ? projectMap.get(item.project)?.color : undefined
  return color ? `project-${color}` : `kind-${item.kind}`
}

function scheduleProjectKey(item: Schedule, taskMap: Map<string, Task>) {
  return item.project || taskMap.get(item.taskId)?.project || '__none__'
}

interface MonthProps {
  month: string
  items: Schedule[]
  onOpen: (item: Schedule) => void
  onAdd: (date: string) => void
  onTaskDrop: (event: DragEvent, date: string) => void
  projectMap: Map<string, ProjectCalendar>
  taskMap: Map<string, Task>
  spotlightProject: string | null
}

function MonthView({
  month, items, onOpen, onAdd, onTaskDrop, projectMap, taskMap, spotlightProject,
}: MonthProps) {
  const [year, value] = month.split('-').map(Number)
  const first = new Date(year, value - 1, 1)
  const start = new Date(year, value - 1, 1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return ymd(date)
  })

  return (
    <div className="schedule-calendar card">
      <div className="schedule-weekdays">
        {DOW.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="schedule-calendar-grid">
        {cells.map((date) => {
          const list = items
            .filter((item) => item.startDate <= date && item.endDate >= date)
            .sort((a, b) => `${a.startTime}${a.title}`.localeCompare(`${b.startTime}${b.title}`))
          return (
            <div
              className={`schedule-day${date.slice(0, 7) !== month ? ' outside' : ''}${date === today() ? ' today' : ''}`}
              key={date}
              onClick={() => onAdd(date)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onTaskDrop(event, date)}
            >
              <div className="schedule-day-number">{Number(date.slice(8))}</div>
              <div className="schedule-day-items">
                {list.map((item) => (
                  <button
                    className={`schedule-event ${scheduleTone(item, projectMap)}${item.startDate < date ? ' continues-left' : ''}${item.endDate > date ? ' continues-right' : ''}${spotlightProject && scheduleProjectKey(item, taskMap) !== spotlightProject ? ' dimmed' : ''}`}
                    key={item.id}
                    title={item.title}
                    onClick={(event) => { event.stopPropagation(); onOpen(item) }}
                  >
                    {!item.allDay && item.startDate === date && <span>{item.startTime}</span>}
                    <b>{item.title}</b>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimelineView({ month, items, taskMap, projectMap, spotlightProject, onOpen }: {
  month: string
  items: Schedule[]
  taskMap: Map<string, Task>
  projectMap: Map<string, ProjectCalendar>
  spotlightProject: string | null
  onOpen: (item: Schedule) => void
}) {
  const [year, value] = month.split('-').map(Number)
  const last = new Date(year, value, 0).getDate()
  const firstDate = `${month}-01`
  const lastDate = `${month}-${String(last).padStart(2, '0')}`
  const rows = items
    .filter((item) => item.startDate <= lastDate && item.endDate >= firstDate)
    .sort((a, b) => (a.taskId ? taskMap.get(a.taskId)?.title : a.title)?.localeCompare(
      b.taskId ? taskMap.get(b.taskId)?.title ?? b.title : b.title,
    ) ?? 0)

  if (rows.length === 0) return <div className="empty">이 달에 표시할 일정이 없습니다.</div>

  return (
    <div className="schedule-timeline card">
      <div className="timeline-head">
        <div className="timeline-label">업무</div>
        <div className="timeline-days" style={{ gridTemplateColumns: `repeat(${last}, minmax(24px, 1fr))` }}>
          {Array.from({ length: last }, (_, index) => index + 1).map((day) => (
            <span className={(new Date(year, value - 1, day).getDay() % 6 === 0) ? 'weekend' : ''} key={day}>
              {day}
            </span>
          ))}
        </div>
      </div>
      {rows.map((item) => {
        const clippedStart = item.startDate < firstDate ? firstDate : item.startDate
        const clippedEnd = item.endDate > lastDate ? lastDate : item.endDate
        const start = daysBetween(firstDate, clippedStart) + 1
        const span = daysBetween(clippedStart, clippedEnd) + 1
        const task = taskMap.get(item.taskId)
        return (
          <div
            className={`timeline-row${spotlightProject && scheduleProjectKey(item, taskMap) !== spotlightProject ? ' dimmed' : ''}`}
            key={item.id}
          >
            <button className="timeline-label timeline-name" onClick={() => onOpen(item)}>
              <b>{task?.title ?? item.title}</b>
              <span>{item.project || task?.project || SCHEDULE_KIND_LABEL[item.kind]}</span>
            </button>
            <div className="timeline-track" style={{ gridTemplateColumns: `repeat(${last}, minmax(24px, 1fr))` }}>
              {Array.from({ length: last }, (_, index) => (
                <i className={(new Date(year, value - 1, index + 1).getDay() % 6 === 0) ? 'weekend' : ''} key={index} />
              ))}
              <button
                className={`timeline-bar ${scheduleTone(item, projectMap)}`}
                style={{ gridColumn: `${start} / span ${span}` }}
                onClick={() => onOpen(item)}
                title={`${item.title} · ${item.startDate} ~ ${item.endDate}`}
              >
                {item.title}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScheduleModal({ draft, projects, onChange, onSave, onRemove, onClose }: {
  draft: Schedule
  projects: string[]
  onChange: (draft: Schedule) => void
  onSave: () => void
  onRemove?: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={draft.id ? '일정 편집' : '새 일정'}
      onClose={onClose}
      onSubmit={onSave}
      extraActions={onRemove ? <button className="btn ghost danger" onClick={onRemove}>삭제</button> : undefined}
    >
      <div className="field">
        <label>제목</label>
        <input className="input" autoFocus value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="예) 기획안 초안 작성" />
      </div>
      <div className="row">
        <div className="field">
          <label>구분</label>
          <select className="select" value={draft.kind} onChange={(e) => onChange({ ...draft, kind: e.target.value as ScheduleKind })}>
            {KINDS.map((value) => <option value={value} key={value}>{SCHEDULE_KIND_LABEL[value]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>프로젝트 연결</label>
          <select className="select" value={draft.project} onChange={(e) => onChange({ ...draft, project: e.target.value })}>
            <option value="">프로젝트 없음</option>
            {projects.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className="schedule-all-day">
        <label><input type="checkbox" checked={draft.allDay} onChange={(e) => onChange({ ...draft, allDay: e.target.checked })} /> 종일 일정</label>
      </div>
      <div className="row">
        <div className="field">
          <label>시작일</label>
          <DateInput value={draft.startDate} onChange={(value) => onChange({ ...draft, startDate: value, endDate: draft.endDate < value ? value : draft.endDate })} />
        </div>
        {!draft.allDay && <div className="field"><label>시작 시간</label><DateInput type="time" value={draft.startTime} onChange={(value) => onChange({ ...draft, startTime: value })} /></div>}
        <div className="field">
          <label>종료일</label>
          <DateInput value={draft.endDate} onChange={(value) => onChange({ ...draft, endDate: value })} />
        </div>
        {!draft.allDay && <div className="field"><label>종료 시간</label><DateInput type="time" value={draft.endTime} onChange={(value) => onChange({ ...draft, endTime: value })} /></div>}
      </div>
      <div className="schedule-duration-presets">
        <span>기간</span>
        {[1, 3, 5, 7].map((days) => (
          <button className="btn ghost sm" key={days} onClick={() => onChange({ ...draft, endDate: addDays(draft.startDate, days - 1) })}>{days}일</button>
        ))}
      </div>
      <div className="field">
        <label>장소</label>
        <input className="input" value={draft.location} onChange={(e) => onChange({ ...draft, location: e.target.value })} placeholder="선택 사항" />
      </div>
      <div className="field">
        <label>메모</label>
        <textarea className="textarea" rows={4} value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} placeholder="준비할 내용이나 참고 사항" />
      </div>
    </Modal>
  )
}

function ProjectModal({ draft, onChange, onSave, onClose }: {
  draft: ProjectCalendar
  onChange: (draft: ProjectCalendar) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <Modal title="프로젝트 캘린더 추가" onClose={onClose} onSubmit={onSave} submitLabel="추가">
      <div className="field">
        <label>프로젝트 이름</label>
        <input
          className="input"
          autoFocus
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="예) 신규 서비스 준비"
        />
      </div>
      <div className="field">
        <label>캘린더 색상</label>
        <div className="project-color-options">
          {PROJECT_COLORS.map((color) => (
            <button
              type="button"
              className={`project-color-option project-${color}${draft.color === color ? ' active' : ''}`}
              key={color}
              onClick={() => onChange({ ...draft, color })}
            >
              <span />
              {colorLabel(color)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
