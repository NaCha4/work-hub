import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { firebaseConfigured } from '../lib/firebase'
import { HOLIDAYS } from '../lib/holidays'
import { dday, today, withDow } from '../lib/markdown'
import { fetchScheduleShare } from '../lib/scheduleShare'
import {
  PROJECT_STATUS_LABEL,
  SCHEDULE_KIND_LABEL,
  type ProjectCalendarColor,
  type ScheduleShare,
  type SharedProject,
  type SharedSchedule,
} from '../lib/types'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function dateAt(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

function daysBetween(from: string, to: string) {
  return Math.round((dateAt(to).getTime() - dateAt(from).getTime()) / 86400000)
}

function progressOf(project: SharedProject) {
  const done = project.milestones.filter((m) => m.done).length
  const total = project.milestones.length
  const percent = project.status === 'done' ? 100 : total ? Math.round((done / total) * 100) : 0
  return { done, total, percent }
}

/**
 * 비로그인 방문자용 프로젝트 일정 조회 화면. 달력이 기본이고, 상단 탭에서
 * 프로젝트를 고르면 달력은 그 일정만 보여주며 우측에 마일스톤 진행 과정을 편다.
 * 열지 못한 코드는 이유를 구분하지 않고 '열 수 없음'으로만 답한다.
 */
export default function ScheduleShareView() {
  const { code } = useParams()
  const [share, setShare] = useState<ScheduleShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [month, setMonth] = useState(() => today().slice(0, 7))

  useEffect(() => {
    if (!code) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchScheduleShare(code).then((result) => {
      if (cancelled) return
      setShare(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [code])

  const colorMap = useMemo(
    () => new Map((share?.projects ?? []).map((project) => [project.name, project.color])),
    [share],
  )

  if (!firebaseConfigured) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>준비 중입니다</h1>
          <p>아직 서버 설정이 끝나지 않았습니다.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="login-wrap"><p className="muted">불러오는 중…</p></div>
  }

  if (!share) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>열 수 없는 링크입니다</h1>
          <p>주소가 정확한지 확인하거나, 링크를 보낸 사람에게 다시 요청해 주세요.</p>
        </div>
      </div>
    )
  }

  const selectedProject = share.projects.find((project) => project.name === selected)
  const selectedSchedules = share.schedules.filter((item) => item.project === selected)

  function shiftMonth(delta: number) {
    const [year, value] = month.split('-').map(Number)
    setMonth(ymd(new Date(year, value - 1 + delta, 1)).slice(0, 7))
  }

  return (
    <div className="share-view share-view-wide">
      <div className="share-toolbar card">
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
      </div>

      <div className="share-cal-layout">
        <div className="share-cal-main">
          <ShareCalendar
            month={month}
            schedules={share.schedules}
            projects={share.projects}
            colorMap={colorMap}
            selected={selected}
            onSelectProject={setSelected}
          />
          {selectedProject && (
            <div className="share-detail">
              <ProjectPanel project={selectedProject} schedules={selectedSchedules} />
            </div>
          )}
        </div>

        <aside className="share-side">
          <section className="card">
            <h3 className="share-side-title">프로젝트</h3>
            <button
              className={`share-side-project${selected === '' ? ' active' : ''}`}
              onClick={() => setSelected('')}
            >
              <span className="name">전체</span>
            </button>
            {share.projects.map((project) => {
              const { total, percent } = progressOf(project)
              return (
                <button
                  className={`share-side-project${selected === project.name ? ' active' : ''}`}
                  key={project.name}
                  onClick={() => setSelected(project.name)}
                >
                  <span className={`project-calendar-dot project-${project.color}`} />
                  <span className="name">{project.name}</span>
                  {total > 0 && (
                    <>
                      <span className="mini-track"><span className="mini-fill" style={{ width: `${percent}%` }} /></span>
                      <span className="pct">{percent}%</span>
                    </>
                  )}
                </button>
              )
            })}
          </section>
        </aside>
      </div>
    </div>
  )
}

/** 선택한 프로젝트의 진행 과정 — 상태·납기·진행률·마일스톤·다가오는 일정 */
function ProjectPanel({ project, schedules }: {
  project: SharedProject
  schedules: SharedSchedule[]
}) {
  const t = today()
  const { done, total, percent } = progressOf(project)
  const upcoming = schedules.filter((item) => item.endDate >= t).slice(0, 6)

  return (
    <>
      <section className="card">
        <div className="proj-head">
          <span className={`project-calendar-dot project-${project.color}`} />
          <h3>{project.name}</h3>
          <span className={`project-calendar-state state-${project.status}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
        </div>
        {project.due && project.status !== 'done' && (
          <p className={`proj-meta${project.due < t ? ' overdue-text' : ''}`}>
            납기 {withDow(project.due)} · {dday(project.due, t)}
          </p>
        )}
        {total > 0 && (
          <>
            <div className="progress-row">
              <div className="progress-track"><span className="progress-fill" style={{ width: `${percent}%` }} /></div>
              <span className="progress-label">{percent}%</span>
            </div>
            <p className="proj-meta">마일스톤 {done}/{total} 완료</p>
          </>
        )}
        {total > 0 && (
          <ul className="milestone-list">
            {project.milestones.map((milestone) => (
              <li className={milestone.done ? 'done' : ''} key={milestone.id}>
                <span className="milestone-date">{milestone.date.slice(5)}</span>
                <span className="milestone-name">{milestone.name}</span>
                <span className={`milestone-state${!milestone.done && milestone.date < t ? ' overdue' : ''}`}>
                  {milestone.done ? '완료' : dday(milestone.date, t)}
                </span>
                {milestone.notes?.trim() && <span className="milestone-memo">{milestone.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="share-side-title">다가오는 일정</h3>
        {upcoming.length === 0 ? (
          <p className="share-empty">남은 일정이 없습니다.</p>
        ) : (
          <ul className="share-schedules">
            {upcoming.map((item, index) => (
              <li key={index}>
                <span className="share-schedule-date">
                  {item.startDate.slice(5)}
                  {item.endDate !== item.startDate && `~${item.endDate.slice(5)}`}
                </span>
                <span className="share-schedule-title">{item.title}</span>
                <span className="share-schedule-kind">{SCHEDULE_KIND_LABEL[item.kind]}</span>
                {item.notes?.trim() && <span className="milestone-memo">{item.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="share-side-title">메모</h3>
        {project.notes?.trim()
          ? <p className="overview-notes">{project.notes}</p>
          : <p className="share-empty">등록된 메모가 없습니다.</p>}
      </section>
    </>
  )
}

interface ShareMarker {
  project: string
  color: ProjectCalendarColor
  label: string
  done?: boolean
  notes?: string
}

/** 읽기 전용 월간 달력 — 일정 화면의 주 단위 레인 배치를 그대로 따른다. */
function ShareCalendar({ month, schedules, projects, colorMap, selected, onSelectProject }: {
  month: string
  schedules: SharedSchedule[]
  projects: SharedProject[]
  colorMap: Map<string, ProjectCalendarColor>
  selected: string
  onSelectProject: (name: string) => void
}) {
  const [year, value] = month.split('-').map(Number)
  const first = new Date(year, value - 1, 1)
  const start = new Date(year, value - 1, 1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return ymd(date)
  })

  const markers = new Map<string, ShareMarker[]>()
  const putMarker = (date: string, marker: ShareMarker) => {
    if (!date) return
    markers.set(date, [...(markers.get(date) ?? []), marker])
  }
  for (const project of projects) {
    if (project.due && project.status !== 'done') {
      putMarker(project.due, { project: project.name, color: project.color, label: `${project.name} 납기` })
    }
    for (const milestone of project.milestones) {
      putMarker(milestone.date, {
        project: project.name,
        color: project.color,
        label: milestone.name,
        done: milestone.done,
        notes: milestone.notes,
      })
    }
  }

  const weeks = Array.from({ length: 6 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return (
    <div className="schedule-calendar card">
      <div className="schedule-weekdays">
        {DOW.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="schedule-calendar-grid">
        {weeks.map((week) => {
          const weekStart = week[0]
          const weekEnd = week[6]
          const lanes: boolean[][] = []
          const claim = (col: number, span: number) => {
            for (let lane = 0; ; lane += 1) {
              lanes[lane] ??= []
              if (lanes[lane].slice(col, col + span).some(Boolean)) continue
              for (let i = col; i < col + span; i += 1) lanes[lane][i] = true
              return lane
            }
          }

          const markerBars = week.flatMap((date, col) =>
            (markers.get(date) ?? []).map((marker, index) => ({
              key: `m-${date}-${index}`,
              col,
              lane: claim(col, 1),
              marker,
            })),
          )
          const eventBars = schedules
            .filter((item) => item.startDate <= weekEnd && item.endDate >= weekStart)
            .sort((a, b) =>
              a.startDate.localeCompare(b.startDate)
              || daysBetween(b.startDate, b.endDate) - daysBetween(a.startDate, a.endDate)
              || a.title.localeCompare(b.title))
            .map((item, index) => {
              const from = item.startDate < weekStart ? weekStart : item.startDate
              const to = item.endDate > weekEnd ? weekEnd : item.endDate
              const col = daysBetween(weekStart, from)
              return {
                key: `e-${index}-${item.title}`,
                item,
                col,
                span: daysBetween(from, to) + 1,
                lane: claim(col, daysBetween(from, to) + 1),
                continuesLeft: item.startDate < weekStart,
                continuesRight: item.endDate > weekEnd,
              }
            })

          return (
            <div
              className="schedule-week"
              key={weekStart}
              style={{ minHeight: 38 + lanes.length * 22 }}
            >
              {week.map((date) => {
                const holiday = HOLIDAYS[date]
                return (
                  <div
                    className={`schedule-day${date.slice(0, 7) !== month ? ' outside' : ''}${date === today() ? ' today' : ''}${holiday ? ' holiday' : ''}`}
                    key={date}
                  >
                    <div className="schedule-day-head">
                      <div className="schedule-day-number">{Number(date.slice(8))}</div>
                      {holiday && <span className="schedule-day-holiday" title={holiday}>{holiday}</span>}
                    </div>
                  </div>
                )
              })}
              <div className="schedule-week-bars">
                {markerBars.map((bar) => (
                  <button
                    className={`schedule-marker project-${bar.marker.color}${bar.marker.done ? ' done' : ''}${selected && bar.marker.project !== selected ? ' dimmed' : ''}`}
                    key={bar.key}
                    style={{ gridColumn: `${bar.col + 1} / span 1`, gridRow: bar.lane + 1 }}
                    title={`${bar.marker.project} · ${bar.marker.label}${bar.marker.notes?.trim() ? `\n${bar.marker.notes}` : ''}`}
                    onClick={() => onSelectProject(bar.marker.project)}
                  >
                    {bar.marker.label}
                  </button>
                ))}
                {eventBars.map((bar) => {
                  const color = colorMap.get(bar.item.project)
                  return (
                    <div
                      className={`schedule-event ${color ? `project-${color}` : `kind-${bar.item.kind}`}${bar.continuesLeft ? ' continues-left' : ''}${bar.continuesRight ? ' continues-right' : ''}${selected && bar.item.project !== selected ? ' dimmed' : ''}`}
                      key={bar.key}
                      style={{ gridColumn: `${bar.col + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }}
                      title={`${bar.item.title} · ${bar.item.startDate} ~ ${bar.item.endDate}${bar.item.notes?.trim() ? `\n${bar.item.notes}` : ''}`}
                    >
                      {!bar.item.allDay && !bar.continuesLeft && bar.item.startTime && <span>{bar.item.startTime}</span>}
                      <b>{bar.item.title}</b>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
