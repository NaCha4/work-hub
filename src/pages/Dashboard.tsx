import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/db'
import { today } from '../lib/markdown'
import { TASK_STATUS_LABEL, type Journal, type Meeting, type Prep, type Task } from '../lib/types'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Dashboard() {
  const { member } = useAuth()
  const enabled = !!member
  const { items: tasks } = useCollection<Task>('tasks', enabled)
  const { items: journals } = useCollection<Journal>('journals', enabled)
  const { items: meetings } = useCollection<Meeting>('meetings', enabled)
  const { items: preps } = useCollection<Prep>('preps', enabled)

  const t = today()
  const open = tasks.filter((x) => x.status !== 'done')
  const overdue = open.filter((x) => x.due && x.due < t)
  const dueToday = open.filter((x) => x.due === t)
  const upcoming = meetings.filter((m) => m.date >= t).sort((a, b) => a.date.localeCompare(b.date))
  const wroteToday = journals.some((j) => j.date === t && j.authorUid === member?.uid)

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
        <h1>안녕하세요, {member?.displayName?.split(' ')[0] ?? ''}님 👋</h1>
        <span className="spacer" />
        <button className="btn sm" onClick={copyWeekly}>주간 보고 초안 복사</button>
      </div>
      <p className="page-sub">{t}</p>

      {!wroteToday && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 12 }}>
          오늘 업무 일지를 아직 안 썼습니다. <Link to="/journal">지금 작성하기 →</Link>
        </div>
      )}

      <div className="grid cols-3">
        <Stat label="진행 중인 할 일" value={open.length} to="/tasks" />
        <Stat label="기한 지남" value={overdue.length} to="/tasks" danger={overdue.length > 0} />
        <Stat label="오늘 마감" value={dueToday.length} to="/tasks" />
        <Stat label="작성한 일지" value={journals.length} to="/journal" />
        <Stat label="회의록" value={meetings.length} to="/meetings" />
        <Stat label="준비자료" value={preps.length} to="/preps" />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
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

        <div className="card">
          <div className="card-head"><h3>급한 할 일</h3></div>
          {open.length === 0 && <p className="muted">할 일이 없습니다. 🎉</p>}
          {[...open]
            .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
            .slice(0, 6)
            .map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span className={`chip status-${x.status}`}>{TASK_STATUS_LABEL[x.status]}</span>
                <span style={{ flex: 1 }}>{x.title}</span>
                {x.due && (
                  <span className={`muted ${x.due < t ? 'overdue' : ''}`} style={{ fontSize: 12 }}>
                    {x.due.slice(5)}
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, to, danger }: { label: string; value: number; to: string; danger?: boolean }) {
  return (
    <Link to={to} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: danger ? 'var(--danger)' : 'inherit' }}>
        {value}
      </div>
    </Link>
  )
}
