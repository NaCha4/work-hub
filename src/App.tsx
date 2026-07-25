import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import Tasks from './pages/Tasks'
import Meetings from './pages/Meetings'
import Preps from './pages/Preps'
import Settings from './pages/Settings'
import SessionView from './pages/SessionView'

export default function App() {
  return (
    <Routes>
      {/* 발표 세션은 로그인 없이 열려야 하므로 인증 게이트 바깥에 둔다. */}
      <Route path="/s" element={<SessionView />} />
      <Route path="/s/:code" element={<SessionView />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  )
}

function PrivateApp() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <div className="login-wrap"><p className="muted">불러오는 중…</p></div>
  }
  if (status !== 'ready') return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/preps" element={<Preps />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
