import AccessList from '../components/AccessList'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/db'
import type { Journal, Meeting, Member, Prep, Task } from '../lib/types'

export default function Settings() {
  const { member } = useAuth()
  const enabled = !!member
  const { items: members } = useCollection<Member & { id: string }>('members', enabled)
  const { items: journals } = useCollection<Journal>('journals', enabled)
  const { items: tasks } = useCollection<Task>('tasks', enabled)
  const { items: meetings } = useCollection<Meeting>('meetings', enabled)
  const { items: preps } = useCollection<Prep>('preps', enabled)

  /** 전체 데이터를 JSON 으로 백업한다. */
  function exportAll() {
    const dump = { exportedAt: new Date().toISOString(), journals, tasks, meetings, preps }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `work-hub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="page">
      <div className="page-head"><h1>⚙️ 설정</h1></div>

      <div className="card">
        <div className="card-head"><h3>내 계정</h3></div>
        <p style={{ margin: 0 }}>{member?.displayName}</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {member?.email} · 권한 {member?.role}
        </p>
      </div>

      <AccessList />

      <div className="card">
        <div className="card-head"><h3>멤버 ({members.length})</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          허용된 계정이 처음 로그인하면 자동으로 등록됩니다.
        </p>
        {members.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ flex: 1 }}>{m.displayName}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{m.email}</span>
            <span className="tag">{m.role}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3>데이터 백업</h3></div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          일지 {journals.length} · 할 일 {tasks.length} · 회의록 {meetings.length} · 준비자료 {preps.length}
        </p>
        <button className="btn" onClick={exportAll}>전체 JSON 내려받기</button>
      </div>
    </div>
  )
}
