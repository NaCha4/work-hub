import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, firebaseConfigured } from './firebase'
import type { Member } from './types'

type Status = 'loading' | 'signed-out' | 'no-access' | 'ready' | 'unconfigured'

interface AuthValue {
  status: Status
  user: User | null
  member: Member | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(
    firebaseConfigured ? 'loading' : 'unconfigured',
  )
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseConfigured) return
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        setMember(null)
        setStatus('signed-out')
        return
      }
      // 어느 단계에서 막혔는지 알아야 원인을 짚을 수 있다.
      // 조회 실패는 규칙 설정 문제, 생성 실패는 허용 목록 문제일 가능성이 높다.
      let phase: '조회' | '등록' = '조회'
      try {
        const ref = doc(db, 'members', u.uid)
        let snap = await getDoc(ref)
        if (!snap.exists()) {
          // 최초 로그인. 허용 목록(config/access)에 없으면 규칙이 이 쓰기를 거부한다.
          phase = '등록'
          await setDoc(ref, {
            uid: u.uid,
            email: u.email ?? '',
            displayName: u.displayName ?? u.email ?? '이름 없음',
            photoURL: u.photoURL ?? '',
            role: 'member',
            joinedAt: Date.now(),
          })
          snap = await getDoc(ref)
        }
        setMember({ ...(snap.data() as Member), uid: u.uid })
        setStatus('ready')
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'unknown'
        console.warn(`member ${phase} failed [${code}]`, e)
        setError(
          phase === '등록'
            ? `${u.email} 은 허용 목록에 없습니다. 설정의 허용 계정 목록을 확인해 주세요. (${code})`
            : `계정 확인에 실패했습니다. 보안 규칙이 최신인지 확인해 주세요. (${code})`,
        )
        setStatus('no-access')
      }
    })
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      member,
      error,
      async signIn() {
        setError(null)
        try {
          await signInWithPopup(auth, googleProvider)
        } catch (e) {
          const err = e as { code?: string; message?: string }
          if (err.code === 'auth/popup-closed-by-user') return
          setError(err.message ?? '로그인에 실패했습니다.')
        }
      },
      async signOut() {
        await fbSignOut(auth)
        setStatus('signed-out')
      },
    }),
    [status, user, member, error],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
