import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCode, isValidCodeShape, normalizeCode } from '../lib/session'

interface Props {
  /** 코드 조회 실패처럼 바깥에서 생긴 오류 */
  externalError?: string | null
  /** 입력창 아래에 붙일 것 (보통 로그인 링크) */
  footer?: ReactNode
}

/**
 * 세션 코드 입력 폼. 로그아웃 상태의 첫 화면과 /s 경로가 함께 쓴다.
 * 이 앱을 여는 사람 대부분은 발표 자료를 보러 온 팀원이므로,
 * 서비스 소개 없이 입력창만 둔다.
 */
export default function CodeEntry({ externalError, footer }: Props) {
  const nav = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidCodeShape(input)) {
      setError('8자리 코드를 정확히 입력해 주세요.')
      return
    }
    nav(`/s/${formatCode(input)}`)
  }

  const shown = error ?? externalError

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <label className="code-label" htmlFor="wh-code">세션 코드</label>
        <input
          id="wh-code"
          className="input code-input"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          maxLength={9}
          value={input}
          onChange={(e) => {
            const raw = normalizeCode(e.target.value).slice(0, 8)
            setInput(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw)
            setError(null)
          }}
        />
        {shown && <div className="error-banner" style={{ marginTop: 12 }}>{shown}</div>}
        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
        >
          자료 보기
        </button>
        {footer && <div className="entry-foot">{footer}</div>}
      </form>
    </div>
  )
}
