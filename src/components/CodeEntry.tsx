import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CODE_LEN, fetchSession, isValidCodeShape, normalizeCode } from '../lib/session'

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
  const latest = useRef('')

  /**
   * 코드가 다 채워지면 여기서 먼저 열어보고, 열리는 코드일 때만 화면을 넘긴다.
   * 확인 버튼이 없는 것도, 틀렸을 때 아무 말이 없는 것도 같은 이유다 — 코드 자체가
   * 유일한 인증 수단이라 어떤 반응이든 세션에 대한 단서가 된다.
   *
   * 조회 결과를 보지 않고 곧바로 넘기면 틀린 코드에서도 라우트가 바뀌어
   * 입력 화면이 다시 그려진다(입력값이 지워지고 화면이 깜빡인다). 그것 자체가
   * "그 코드는 아니다" 라는 응답이 되므로, 실패하면 아무것도 하지 않는다.
   */
  function change(value: string) {
    const raw = normalizeCode(value).slice(0, CODE_LEN)
    setInput(raw)
    latest.current = raw
    if (!isValidCodeShape(raw)) return
    void fetchSession(raw).then((r) => {
      // 조회하는 사이에 입력이 바뀌었으면 이미 지난 결과다.
      if (r.ok && latest.current === raw) nav(`/s/${raw}`)
    })
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
