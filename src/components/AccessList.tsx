import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * 접근 허용 계정 목록. Firestore 의 config/access 문서 하나를 편집한다.
 * 저장소가 공개라서 이 목록을 규칙 파일이 아니라 DB 에 둔다 — 코드에 계정이 남지 않고,
 * 계정을 바꿔도 규칙을 다시 배포할 필요가 없다.
 */
export default function AccessList() {
  const [emails, setEmails] = useState<string[]>([])
  const [exists, setExists] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'config', 'access'),
        (snap) => {
          setExists(snap.exists())
          setEmails((snap.data()?.emails as string[]) ?? [])
          setError(null)
        },
        (e) => setError(e.message),
      ),
    [],
  )

  async function save(next: string[]) {
    try {
      await setDoc(doc(db, 'config', 'access'), { emails: next }, { merge: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function add() {
    const v = input.trim().toLowerCase()
    if (!v) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError('이메일 형식이 아닙니다.')
      return
    }
    if (emails.includes(v)) {
      setError('이미 목록에 있습니다.')
      return
    }
    setInput('')
    void save([...emails, v])
  }

  function remove(mail: string) {
    if (emails.length === 1) {
      alert('마지막 계정은 지울 수 없습니다. 지우면 아무도 로그인하지 못합니다.')
      return
    }
    if (!confirm(`${mail} 의 접근을 차단할까요?`)) return
    void save(emails.filter((m) => m !== mail))
  }

  return (
    <div className="card">
      <div className="card-head"><h3>접근 허용 계정 ({emails.length})</h3></div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        여기 있는 Google 계정만 Work Hub 에 로그인할 수 있습니다. 목록에서 지워도 이미
        만들어진 <code>members</code> 문서는 남으므로, 완전히 차단하려면 아래 멤버 목록에서도
        해당 항목을 지워야 합니다.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {exists === false && (
        <div className="error-banner">
          <code>config/access</code> 문서가 없습니다. 지금은 아무도 새로 가입할 수 없습니다.
          아래에 계정을 추가하면 문서가 만들어집니다.
        </div>
      )}

      {emails.map((m) => (
        <div key={m} className="session-row">
          <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{m}</span>
          <button className="btn ghost sm danger" onClick={() => remove(m)}>제거</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <input
          className="input"
          placeholder="name@example.com"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null) }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add}>추가</button>
      </div>
    </div>
  )
}
