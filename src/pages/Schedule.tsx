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
  deleteProjectSchedules,
  renameProjectCalendar,
  saveProjectCalendarOrder,
  updateDocById,
  useCollection,
} from '../lib/db'
import { HOLIDAYS } from '../lib/holidays'
import { dday, formatDate, nowTime, today } from '../lib/markdown'
import {
  buildShareSnapshot,
  publishScheduleShare,
  scheduleShareUrl,
} from '../lib/scheduleShare'
import {
  PROJECT_STATUS_LABEL,
  SCHEDULE_KIND_LABEL,
  TASK_PRIORITY_LABEL,
  type Milestone,
  type ProjectCalendar,
  type ProjectCalendarColor,
  type ProjectStatus,
  type Schedule,
  type ScheduleKind,
  type ScheduleShare,
  type Task,
} from '../lib/types'

const KINDS: ScheduleKind[] = ['personal', 'work', 'meeting', 'focus', 'deadline']
const PROJECT_COLORS: ProjectCalendarColor[] = ['clay', 'blue', 'green', 'violet', 'yellow', 'red']
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DAY_MS = 86400000

type View = 'month' | 'timeline' | 'overview'

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
    allDay: true,
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
  const { items: shares } = useCollection<ScheduleShare>('scheduleShares', !!member)
  const [draft, setDraft] = useState<Schedule | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectCalendar | null>(null)
  const [projectEditing, setProjectEditing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [spotlightProject, setSpotlightProject] = useState<string | null>(null)
  const [dragProject, setDragProject] = useState<string | null>(null)
  const [overProject, setOverProject] = useState<string | null>(null)

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
  const calendarNames = useMemo(() => {
    const names = [...new Set(projectCalendars.map((item) => item.name).concat(projects))]
    return names.sort((a, b) => {
      const aOrder = projectMap.get(a)?.order ?? Number.MAX_SAFE_INTEGER
      const bOrder = projectMap.get(b)?.order ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || a.localeCompare(b)
    })
  }, [projectCalendars, projectMap, projects])
  const projectOrder = useMemo(
    () => new Map(calendarNames.map((name, index) => [name, index])),
    [calendarNames],
  )
  // 공유 문서는 하나만 유지한다. 다시 발행하면 같은 코드에 스냅샷만 갈아끼운다.
  const share = useMemo(
    () => [...shares].sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [shares],
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
      order: calendarNames.length,
      due: '',
      status: 'active',
      milestones: [],
      notes: '',
      authorUid: member!.uid,
      authorName: member!.displayName,
      createdAt: 0,
      updatedAt: 0,
    }
  }

  /** 설정이 없는 암묵적 프로젝트는 이 시점에 기본값을 채워 문서로 만들 준비를 한다. */
  function openProjectSettings(name: string, item?: ProjectCalendar) {
    setProjectEditing(true)
    setProjectDraft(item ? { ...newProject(), ...item } : { ...newProject(), name })
  }

  async function saveProject() {
    if (!projectDraft) return
    const name = projectDraft.name.trim()
    if (!name) return alert('프로젝트 이름을 입력해 주세요.')
    if (!projectEditing && projectCalendars.some((value) => value.name.toLowerCase() === name.toLowerCase())) {
      return alert('같은 이름의 프로젝트가 이미 있습니다.')
    }
    const milestones = (projectDraft.milestones ?? [])
      .filter((m) => m.name.trim())
      .map((m) => ({ ...m, name: m.name.trim() }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = { ...projectDraft, name, milestones }
    if (id) await updateDocById('scheduleProjects', id, data)
    else await createDoc('scheduleProjects', data)
    setProjectDraft(null)
    setProjectEditing(false)
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

  async function removeProjectSchedules(name: string) {
    const linked = schedules.filter((schedule) => schedule.project === name)
    if (linked.length === 0) return alert(`"${name}" 프로젝트에 삭제할 일정이 없습니다.`)
    if (!confirm(`"${name}" 프로젝트의 일정 ${linked.length}개를 모두 삭제할까요?\n삭제한 일정은 되돌릴 수 없습니다.`)) return
    await deleteProjectSchedules(linked.map((schedule) => schedule.id))
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

  async function dropProject(target: string) {
    const source = dragProject
    setDragProject(null)
    setOverProject(null)
    if (!source || source === target) return
    const next = calendarNames.filter((name) => name !== source)
    const targetIndex = next.indexOf(target)
    next.splice(targetIndex < 0 ? next.length : targetIndex + (calendarNames.indexOf(source) < calendarNames.indexOf(target) ? 1 : 0), 0, source)
    await saveProjectCalendarOrder(next.map((name) => {
      const item = projectMap.get(name)
      return {
        id: item?.id,
        name,
        color: item?.color ?? 'blue',
        authorUid: item?.authorUid ?? member!.uid,
        authorName: item?.authorName ?? member!.displayName,
      }
    }))
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

  async function publishShare() {
    const snapshot = buildShareSnapshot(calendarNames, projectMap, schedules, taskMap)
    if (snapshot.projects.length === 0) return alert('공유할 프로젝트가 없습니다.')
    await publishScheduleShare(share, snapshot, { uid: member!.uid, name: member!.displayName })
  }

  async function stopShare() {
    if (!share) return
    if (!confirm('일정 공유를 중지할까요?\n기존 링크로는 더 이상 열 수 없습니다.')) return
    await updateDocById('scheduleShares', share.id, { active: false })
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
          <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>현황</button>
        </div>
        <button className="btn ghost" onClick={() => setShareOpen(true)}>
          {share?.active ? '공유 중' : '공유'}
        </button>
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
              projectOrder={projectOrder}
              onOpenProject={(name) => openProjectSettings(name, projectMap.get(name))}
            />
          ) : view === 'timeline' ? (
            <TimelineView
              month={month}
              items={visible}
              taskMap={taskMap}
              projectMap={projectMap}
              spotlightProject={spotlightProject}
              projectOrder={projectOrder}
              onOpen={setDraft}
            />
          ) : (
            <ProjectOverviewView
              names={calendarNames}
              projectMap={projectMap}
              schedules={schedules}
              onOpenProject={(name) => openProjectSettings(name, projectMap.get(name))}
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
                    due={calendar?.due}
                    status={calendar?.status}
                    onSelect={() => selectProject(name)}
                    onAdd={() => openNew(today(), undefined, name)}
                    onSettings={() => openProjectSettings(name, calendar)}
                    onColor={(color) => changeProjectColor(name, color, calendar)}
                    onRename={() => renameProject(name, calendar?.color ?? 'blue', calendar)}
                    onRemoveSchedules={() => removeProjectSchedules(name)}
                    onRemove={() => removeProject(name, calendar?.id)}
                    draggable
                    dragging={dragProject === name}
                    dragOver={overProject === name}
                    onDragStart={() => setDragProject(name)}
                    onDragOver={() => setOverProject(name)}
                    onDrop={() => dropProject(name)}
                    onDragEnd={() => { setDragProject(null); setOverProject(null) }}
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
          editing={projectEditing}
          onChange={setProjectDraft}
          onSave={saveProject}
          onClose={() => { setProjectDraft(null); setProjectEditing(false) }}
        />
      )}
      {shareOpen && (
        <ShareModal
          share={share}
          onPublish={publishShare}
          onStop={stopShare}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`schedule-stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>
}

function ProjectCalendarRow({
  name, color, count, selected, unfocused, due, status, onSelect, onAdd, onSettings, onColor, onRename, onRemoveSchedules, onRemove,
  draggable = false, dragging = false, dragOver = false, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  name: string
  color: ProjectCalendarColor
  count: number
  selected: boolean
  unfocused: boolean
  due?: string
  status?: ProjectStatus
  onSelect: () => void
  onAdd: () => void
  onSettings?: () => void
  onColor?: (color: ProjectCalendarColor) => void
  onRename?: () => void
  onRemoveSchedules?: () => void
  onRemove?: () => void
  draggable?: boolean
  dragging?: boolean
  dragOver?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
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
    if (!onRemove && !onColor && !onRename && !onRemoveSchedules && !onSettings) return
    event.preventDefault()
    setContext({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 194)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 252)),
    })
  }

  return (
    <div
      className={`project-calendar-row${selected ? ' selected' : ''}${unfocused ? ' unfocused' : ''}${dragging ? ' dragging' : ''}${dragOver ? ' drag-over' : ''}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragOver={(event) => {
        if (!draggable) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver?.()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.()
      }}
      onDragEnd={onDragEnd}
      onContextMenu={openContext}
      title={onRemove || onColor || onRename || onRemoveSchedules || onSettings ? '우클릭하여 프로젝트 관리' : undefined}
    >
      <button className="project-calendar-toggle" onClick={onSelect} aria-pressed={selected}>
        <span className={`project-calendar-dot project-${color}`} />
        <span className="project-calendar-name">{name}</span>
        {status && status !== 'active' && (
          <span className={`project-calendar-state state-${status}`}>{PROJECT_STATUS_LABEL[status]}</span>
        )}
        {due && status !== 'done' && (
          <span className={`project-calendar-dday${due < today() ? ' overdue' : ''}`} title={`납기 ${due}`}>
            {dday(due, today())}
          </span>
        )}
        <span className="project-calendar-count">{count}</span>
      </button>
      <button className="project-calendar-add" onClick={onAdd} title={`${name} 일정 추가`} aria-label={`${name} 일정 추가`}>+</button>
      {context && (onColor || onRename || onRemoveSchedules || onRemove || onSettings) && (
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
          {onSettings && (
            <button
              className="project-context-action"
              role="menuitem"
              onClick={() => {
                setContext(null)
                onSettings()
              }}
            >
              프로젝트 설정
            </button>
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
          {onRemoveSchedules && (
            <button
              className="project-context-delete"
              role="menuitem"
              onClick={() => {
                setContext(null)
                onRemoveSchedules()
              }}
            >
              일정 전체 삭제
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

function compareSchedules(a: Schedule, b: Schedule, taskMap: Map<string, Task>, projectOrder: Map<string, number>) {
  const aProject = scheduleProjectKey(a, taskMap)
  const bProject = scheduleProjectKey(b, taskMap)
  const aOrder = aProject === '__none__' ? -1 : projectOrder.get(aProject) ?? Number.MAX_SAFE_INTEGER
  const bOrder = bProject === '__none__' ? -1 : projectOrder.get(bProject) ?? Number.MAX_SAFE_INTEGER
  return aOrder - bOrder
    || `${a.startDate}${a.startTime}${a.title}`.localeCompare(`${b.startDate}${b.startTime}${b.title}`)
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
  projectOrder: Map<string, number>
  onOpenProject: (name: string) => void
}

/** 날짜 셀에 얹을 프로젝트 납기·마일스톤 마커 */
interface DayMarker {
  project: string
  color: ProjectCalendarColor
  label: string
  done?: boolean
}

function MonthView({
  month, items, onOpen, onAdd, onTaskDrop, projectMap, taskMap, spotlightProject, projectOrder, onOpenProject,
}: MonthProps) {
  const [year, value] = month.split('-').map(Number)
  const first = new Date(year, value - 1, 1)
  const start = new Date(year, value - 1, 1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return ymd(date)
  })

  const markers = new Map<string, DayMarker[]>()
  const putMarker = (date: string, marker: DayMarker) => {
    if (!date) return
    markers.set(date, [...(markers.get(date) ?? []), marker])
  }
  for (const calendar of projectMap.values()) {
    if (calendar.due && calendar.status !== 'done') {
      putMarker(calendar.due, { project: calendar.name, color: calendar.color, label: `${calendar.name} 납기` })
    }
    for (const milestone of calendar.milestones ?? []) {
      putMarker(milestone.date, {
        project: calendar.name,
        color: calendar.color,
        label: milestone.name,
        done: milestone.done,
      })
    }
  }

  return (
    <div className="schedule-calendar card">
      <div className="schedule-weekdays">
        {DOW.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="schedule-calendar-grid">
        {cells.map((date) => {
          const list = items
            .filter((item) => item.startDate <= date && item.endDate >= date)
            .sort((a, b) => compareSchedules(a, b, taskMap, projectOrder))
          const holiday = HOLIDAYS[date]
          return (
            <div
              className={`schedule-day${date.slice(0, 7) !== month ? ' outside' : ''}${date === today() ? ' today' : ''}${holiday ? ' holiday' : ''}`}
              key={date}
              onClick={() => onAdd(date)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onTaskDrop(event, date)}
            >
              <div className="schedule-day-head">
                <div className="schedule-day-number">{Number(date.slice(8))}</div>
                {holiday && <span className="schedule-day-holiday" title={holiday}>{holiday}</span>}
              </div>
              <div className="schedule-day-items">
                {(markers.get(date) ?? []).map((marker, index) => (
                  <button
                    className={`schedule-marker project-${marker.color}${marker.done ? ' done' : ''}${spotlightProject && marker.project !== spotlightProject ? ' dimmed' : ''}`}
                    key={`m-${index}`}
                    title={`${marker.project} · ${marker.label}`}
                    onClick={(event) => { event.stopPropagation(); onOpenProject(marker.project) }}
                  >
                    {marker.label}
                  </button>
                ))}
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

/** 프로젝트별 진행 현황 — 상태·납기·마일스톤 진척을 한 화면에서 본다. */
function ProjectOverviewView({ names, projectMap, schedules, onOpenProject }: {
  names: string[]
  projectMap: Map<string, ProjectCalendar>
  schedules: Schedule[]
  onOpenProject: (name: string) => void
}) {
  const t = today()

  if (names.length === 0) {
    return <div className="empty">아직 프로젝트가 없습니다. 사이드바에서 프로젝트를 추가해 보세요.</div>
  }

  return (
    <div className="overview-grid">
      {names.map((name) => {
        const item = projectMap.get(name)
        const status = item?.status ?? 'active'
        const milestones = [...(item?.milestones ?? [])].sort((a, b) => a.date.localeCompare(b.date))
        const doneCount = milestones.filter((m) => m.done).length
        const percent = status === 'done'
          ? 100
          : milestones.length
            ? Math.round((doneCount / milestones.length) * 100)
            : 0
        const linked = schedules.filter((schedule) => schedule.project === name)
        const remaining = linked.filter((schedule) => schedule.endDate >= t).length
        return (
          <section className="card overview-card" key={name}>
            <div className="proj-head">
              <span className={`project-calendar-dot project-${item?.color ?? 'blue'}`} />
              <h3>{name}</h3>
              <span className={`project-calendar-state state-${status}`}>{PROJECT_STATUS_LABEL[status]}</span>
              <span className="spacer" />
              {item?.due && status !== 'done' && (
                <span className={`proj-due${item.due < t ? ' overdue' : ''}`}>
                  납기 {item.due} · {dday(item.due, t)}
                </span>
              )}
            </div>
            <div className="progress-row">
              <div className="progress-track"><span className="progress-fill" style={{ width: `${percent}%` }} /></div>
              <span className="progress-label">{percent}%</span>
            </div>
            <p className="proj-meta">
              마일스톤 {doneCount}/{milestones.length} 완료 · 남은 일정 {remaining}개 · 전체 일정 {linked.length}개
            </p>
            {milestones.length > 0 && (
              <ul className="milestone-list">
                {milestones.map((milestone) => (
                  <li className={milestone.done ? 'done' : ''} key={milestone.id}>
                    <span className="milestone-date">{milestone.date}</span>
                    <span className="milestone-name">{milestone.name}</span>
                    <span className={`milestone-state${!milestone.done && milestone.date < t ? ' overdue' : ''}`}>
                      {milestone.done ? '완료' : dday(milestone.date, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {item?.notes?.trim() && <p className="overview-notes">{item.notes}</p>}
            <div className="overview-actions">
              <button className="btn ghost sm" onClick={() => onOpenProject(name)}>설정</button>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TimelineView({ month, items, taskMap, projectMap, spotlightProject, projectOrder, onOpen }: {
  month: string
  items: Schedule[]
  taskMap: Map<string, Task>
  projectMap: Map<string, ProjectCalendar>
  spotlightProject: string | null
  projectOrder: Map<string, number>
  onOpen: (item: Schedule) => void
}) {
  const [year, value] = month.split('-').map(Number)
  const last = new Date(year, value, 0).getDate()
  const firstDate = `${month}-01`
  const lastDate = `${month}-${String(last).padStart(2, '0')}`
  const rows = items
    .filter((item) => item.startDate <= lastDate && item.endDate >= firstDate)
    .sort((a, b) => compareSchedules(a, b, taskMap, projectOrder))

  if (rows.length === 0) return <div className="empty">이 달에 표시할 일정이 없습니다.</div>

  return (
    <div className="schedule-timeline card">
      <div className="timeline-head">
        <div className="timeline-label">업무</div>
        <div className="timeline-days" style={{ gridTemplateColumns: `repeat(${last}, minmax(24px, 1fr))` }}>
          {Array.from({ length: last }, (_, index) => index + 1).map((day) => (
            <span className={(new Date(year, value - 1, day).getDay() % 6 === 0) || HOLIDAYS[`${month}-${String(day).padStart(2, '0')}`] ? 'weekend' : ''} key={day}>
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
                <i className={(new Date(year, value - 1, index + 1).getDay() % 6 === 0) || HOLIDAYS[`${month}-${String(index + 1).padStart(2, '0')}`] ? 'weekend' : ''} key={index} />
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

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'hold', 'done']

function ProjectModal({ draft, editing, onChange, onSave, onClose }: {
  draft: ProjectCalendar
  editing: boolean
  onChange: (draft: ProjectCalendar) => void
  onSave: () => void
  onClose: () => void
}) {
  const milestones = draft.milestones ?? []

  function patchMilestone(index: number, patch: Partial<Milestone>) {
    onChange({
      ...draft,
      milestones: milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    })
  }

  return (
    <Modal
      title={editing ? '프로젝트 설정' : '프로젝트 캘린더 추가'}
      onClose={onClose}
      onSubmit={onSave}
      submitLabel={editing ? '저장' : '추가'}
    >
      <div className="field">
        <label>프로젝트 이름</label>
        <input
          className="input"
          autoFocus={!editing}
          value={draft.name}
          disabled={editing}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="예) 신규 서비스 준비"
        />
        {editing && <p className="field-hint">이름 변경은 사이드바 우클릭 메뉴에서 합니다.</p>}
      </div>
      <div className="row">
        <div className="field">
          <label>상태</label>
          <select
            className="select"
            value={draft.status ?? 'active'}
            onChange={(event) => onChange({ ...draft, status: event.target.value as ProjectStatus })}
          >
            {PROJECT_STATUSES.map((value) => (
              <option value={value} key={value}>{PROJECT_STATUS_LABEL[value]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>납기일</label>
          <DateInput value={draft.due ?? ''} onChange={(value) => onChange({ ...draft, due: value })} />
        </div>
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
      <div className="field">
        <label>마일스톤</label>
        {milestones.length === 0 && <p className="field-hint">중간 목표를 두면 달력과 공유 화면에 함께 표시됩니다.</p>}
        {milestones.map((milestone, index) => (
          <div className="milestone-row" key={milestone.id}>
            <DateInput value={milestone.date} onChange={(value) => patchMilestone(index, { date: value })} />
            <input
              className="input"
              value={milestone.name}
              onChange={(event) => patchMilestone(index, { name: event.target.value })}
              placeholder="예) 1차 오픈"
            />
            <label className="milestone-done">
              <input
                type="checkbox"
                checked={milestone.done}
                onChange={(event) => patchMilestone(index, { done: event.target.checked })}
              />
              완료
            </label>
            <button
              type="button"
              className="btn ghost sm danger"
              onClick={() => onChange({ ...draft, milestones: milestones.filter((_, i) => i !== index) })}
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => onChange({
            ...draft,
            milestones: [...milestones, { id: crypto.randomUUID(), name: '', date: today(), done: false }],
          })}
        >
          + 마일스톤
        </button>
      </div>
      <div className="field">
        <label>메모</label>
        <textarea
          className="textarea"
          rows={3}
          value={draft.notes ?? ''}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          placeholder="프로젝트 참고 사항. 공유 링크에는 나가지 않습니다."
        />
      </div>
    </Modal>
  )
}

function ShareModal({ share, onPublish, onStop, onClose }: {
  share?: ScheduleShare
  onPublish: () => Promise<void>
  onStop: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const active = !!share?.active
  const url = share ? scheduleShareUrl(share.id) : ''

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="일정 공유"
      onClose={onClose}
      onSubmit={() => void run(onPublish)}
      submitLabel={busy ? '발행 중…' : active ? '지금 상태로 다시 발행' : '발행'}
      extraActions={active ? (
        <button className="btn ghost danger" disabled={busy} onClick={() => void run(onStop)}>
          공유 중지
        </button>
      ) : undefined}
    >
      <p className="share-desc">
        발행하면 로그인 없이 프로젝트별 일정·납기·마일스톤을 볼 수 있는 링크가 만들어집니다.
        발행 시점의 내용이 담기므로, 일정을 고친 뒤에는 다시 발행해야 반영됩니다.
        개인 일정(프로젝트 없는 일정)과 장소·메모는 담기지 않습니다.
      </p>
      {active && share && (
        <>
          <div className="field">
            <label>공유 링크</label>
            <div className="share-link-row">
              <input className="input" readOnly value={url} onFocus={(event) => event.target.select()} />
              <button
                className="btn ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(url)
                  setCopied(true)
                }}
              >
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>
          <p className="field-hint">
            마지막 발행 {formatDate(share.publishedAt)} · 프로젝트 {share.projects.length}개 · 일정 {share.schedules.length}개
          </p>
        </>
      )}
      {!active && share && <p className="field-hint">공유가 중지된 상태입니다. 다시 발행하면 같은 링크가 살아납니다.</p>}
    </Modal>
  )
}
