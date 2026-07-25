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

  /**
   * 8자리가 채워지는 순간 바로 넘어간다. 코드를 넣는 것 말고 할 일이 없는 화면이라
   * 확인 버튼을 한 번 더 누르게 할 이유가 없다.
   */
  function change(value: string) {
    const raw = normalizeCode(value).slice(0, 8)
    setInput(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw)
    if (isValidCodeShape(raw)) {
      setError(null)
      nav(`/s/${formatCode(raw)}`)
    } else {
      // 8자리를 다 채웠는데도 통과하지 못했다면 코드에 없는 글자가 섞인 것이다.
      setError(raw.length === 8 ? '코드에 쓰이지 않는 글자가 있습니다.' : null)
    }
  }

  // 버튼은 없지만 입력칸 하나짜리 폼이라 Enter 로도 제출된다. 덜 채운 채 눌렀을 때의 안내용.
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (isValidCodeShape(input)) nav(`/s/${formatCode(input)}`)
    else setError('8자리 코드를 정확히 입력해 주세요.')
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
          onChange={(e) => change(e.target.value)}
        />
        {shown ? (
          <div className="error-banner" style={{ marginTop: 12 }}>{shown}</div>
        ) : (
          <p className="entry-hint">8자리를 모두 입력하면 자동으로 열립니다.</p>
        )}
        {footer && <div className="entry-foot">{footer}</div>}
      </form>
    </div>
  )
}
