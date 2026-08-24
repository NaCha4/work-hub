import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { firebaseConfigured } from '../lib/firebase'
import { dday, formatDate, today, withDow } from '../lib/markdown'
import { fetchScheduleShare } from '../lib/scheduleShare'
import {
  PROJECT_STATUS_LABEL,
  SCHEDULE_KIND_LABEL,
  type ScheduleShare,
  type SharedSchedule,
} from '../lib/types'

/**
 * 비로그인 방문자용 프로젝트 일정 조회 화면. 발표 세션과 같은 원칙으로,
 * 열지 못한 코드는 이유를 구분하지 않고 '열 수 없음'으로만 답한다.
 */
export default function ScheduleShareView() {
  const { code } = useParams()
  const [share, setShare] = useState<ScheduleShare | null>(null)
  const [loading, setLoading] = useState(true)

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

  const t = today()
  const byProject = useMemo(() => {
    const map = new Map<string, SharedSchedule[]>()
    for (const item of share?.schedules ?? []) {
      map.set(item.project, [...(map.get(item.project) ?? []), item])
    }
    return map
  }, [share])

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

  return (
    <div className="share-view">
      <header className="share-head">
        <h1>프로젝트 일정</h1>
        <p className="muted">
          {share.createdByName} 발행 · {formatDate(share.publishedAt)} 기준
        </p>
      </header>

      {share.projects.map((project) => {
        const schedules = byProject.get(project.name) ?? []
        const status = project.status
        const doneCount = project.milestones.filter((m) => m.done).length
        const percent = status === 'done'
          ? 100
          : project.milestones.length
            ? Math.round((doneCount / project.milestones.length) * 100)
            : 0
        const remaining = schedules.filter((item) => item.endDate >= t).length
        return (
          <section className="card share-project" key={project.name}>
            <div className="proj-head">
              <span className={`project-calendar-dot project-${project.color}`} />
              <h2>{project.name}</h2>
              <span className={`project-calendar-state state-${status}`}>{PROJECT_STATUS_LABEL[status]}</span>
              <span className="spacer" />
              {project.due && status !== 'done' && (
                <span className={`proj-due${project.due < t ? ' overdue' : ''}`}>
                  납기 {withDow(project.due)} · {dday(project.due, t)}
                </span>
              )}
            </div>

            <div className="progress-row">
              <div className="progress-track"><span className="progress-fill" style={{ width: `${percent}%` }} /></div>
              <span className="progress-label">{percent}%</span>
            </div>
            <p className="proj-meta">
              마일스톤 {doneCount}/{project.milestones.length} 완료 · 남은 일정 {remaining}개 · 전체 일정 {schedules.length}개
            </p>

            {project.milestones.length > 0 && (
              <ul className="milestone-list">
                {project.milestones.map((milestone) => (
                  <li className={milestone.done ? 'done' : ''} key={milestone.id}>
                    <span className="milestone-date">{withDow(milestone.date)}</span>
                    <span className="milestone-name">{milestone.name}</span>
                    <span className={`milestone-state${!milestone.done && milestone.date < t ? ' overdue' : ''}`}>
                      {milestone.done ? '완료' : dday(milestone.date, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {schedules.length === 0 ? (
              <p className="share-empty">등록된 일정이 없습니다.</p>
            ) : (
              <ul className="share-schedules">
                {schedules.map((item, index) => (
                  <li className={item.endDate < t ? 'past' : ''} key={index}>
                    <span className="share-schedule-date">
                      {withDow(item.startDate)}
                      {item.endDate !== item.startDate && ` ~ ${withDow(item.endDate)}`}
                      {!item.allDay && item.startTime && ` ${item.startTime}`}
                      {!item.allDay && item.endTime && `–${item.endTime}`}
                    </span>
                    <span className="share-schedule-title">{item.title}</span>
                    <span className="share-schedule-kind">{SCHEDULE_KIND_LABEL[item.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <footer className="share-foot muted">Work Hub 일정 공유 · 발행 시점의 내용입니다.</footer>
    </div>
  )
}
