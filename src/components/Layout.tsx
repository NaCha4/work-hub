import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import Icon, { type IconName } from './Icon'
import SearchModal from './SearchModal'
import { useAuth } from '../lib/auth'

const NAV: { to: string; label: string; ico: IconName }[] = [
  // 할 일은 별도 화면이 아니라 대시보드 안에 있다.
  { to: '/', label: '대시보드', ico: 'dashboard' },
  { to: '/journal', label: '업무 일지', ico: 'journal' },
  { to: '/meetings', label: '회의 메모', ico: 'meetings' },
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
  const [searching, setSearching] = useState(false)

  // 검색은 어느 화면에서든 Ctrl+K 로 연다. 편집 중 텍스트 입력과는 충돌하지 않는 조합이다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
        {/* 메뉴 맨 아래에 둔다. 브랜드 바로 밑에 두면 대시보드를 누르려다 자꾸 잘못 눌린다. */}
        <button className="nav-link nav-search" onClick={() => setSearching(true)}>
          <span className="ico"><Icon name="search" size={17} /></span>
          검색
          <span className="kbd">Ctrl K</span>
        </button>
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
      {searching && <SearchModal onClose={() => setSearching(false)} />}
    </div>
  )
}
