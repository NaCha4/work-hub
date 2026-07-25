import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import Icon, { type IconName } from './Icon'
import { useAuth } from '../lib/auth'

const NAV: { to: string; label: string; ico: IconName }[] = [
  { to: '/', label: '대시보드', ico: 'dashboard' },
  { to: '/journal', label: '업무 일지', ico: 'journal' },
  { to: '/tasks', label: '할 일', ico: 'tasks' },
  { to: '/meetings', label: '회의록', ico: 'meetings' },
  { to: '/preps', label: '준비자료', ico: 'preps' },
  { to: '/settings', label: '설정', ico: 'settings' },
]

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('wh-theme') as 'light' | 'dark') ?? 'light',
  )
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('wh-theme', theme)
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }
}

export default function Layout({ children }: { children: ReactNode }) {
  const { member, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <Icon name="brand" size={18} />
          Work Hub
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
            <span className="ico"><Icon name={n.ico} size={17} /></span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="me">
            {member?.photoURL ? (
              <img src={member.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback">{member?.displayName?.[0] ?? '?'}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="me-name">{member?.displayName}</div>
              <div className="me-mail">{member?.email}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn ghost sm"
              onClick={toggle}
              title="테마 전환"
              aria-label={theme === 'light' ? '어두운 테마로' : '밝은 테마로'}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
            </button>
            <button className="btn ghost sm" onClick={signOut}>로그아웃</button>
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
