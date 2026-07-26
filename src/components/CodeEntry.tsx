import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CODE_LEN, isValidCodeShape, normalizeCode } from '../lib/session'

interface Props {
  /** 로그인 과정에서 생긴 오류. 세션 코드에 대한 오류는 여기로 들어오지 않는다 */
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

  /**
   * 코드가 다 채워지는 순간 바로 넘어간다. 코드를 넣는 것 말고 할 일이 없는 화면이라
   * 확인 버튼을 한 번 더 누르게 할 이유가 없다.
   *
   * 형식이 어긋나도 아무 말을 하지 않는다. 맞았는지 틀렸는지, 왜 안 되는지를
   * 알려주지 않는 것이 이 화면의 규칙이다 — 코드 자체가 유일한 인증 수단이라
   * 어떤 반응이든 세션에 대한 단서가 된다.
   */
  function change(value: string) {
    const raw = normalizeCode(value).slice(0, CODE_LEN)
    setInput(raw)
    if (isValidCodeShape(raw)) nav(`/s/${raw}`)
  }

  return (
    <div className="login-wrap">
      {/* 버튼은 없지만 입력칸 하나짜리 폼이라 Enter 로 제출된다. 새로고침만 막으면 된다. */}
      <form className="card login-card" onSubmit={(e) => e.preventDefault()}>
        <label className="code-label" htmlFor="wh-code">세션 코드</label>
        <input
          id="wh-code"
          className="input code-input"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={CODE_LEN}
          value={input}
          onChange={(e) => change(e.target.value)}
        />
        {/* 로그인 쪽에서 넘어온 오류만 띄운다. 코드에 대해서는 아무것도 알려주지 않는다. */}
        {externalError && (
          <div className="error-banner" style={{ marginTop: 12 }}>{externalError}</div>
        )}
        {footer && <div className="entry-foot">{footer}</div>}
      </form>
    </div>
  )
}
