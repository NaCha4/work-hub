import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  STROKE_LIMIT,
  clearAll,
  clearStrokes,
  hidePointer,
  putStroke,
  sendPointer,
  sendView,
  useLive,
} from '../lib/live'

/** 포인터와 획을 보내는 간격. 60ms 면 눈에 끊겨 보이지 않으면서 오가는 양이 적다. */
const THROTTLE = 60

const COLORS = ['#e5484d', '#f5a524', '#2f7bd8']
const MODES = [
  { key: 'off', label: '끄기' },
  { key: 'pointer', label: '포인터' },
  { key: 'pen', label: '펜' },
] as const

type Mode = (typeof MODES)[number]['key']

interface Props {
  code: string
  /** 이 세션을 만든 사람인가. 발표자만 그리고, 나머지는 보기만 한다. */
  presenter: boolean
  /** 스크롤을 맡는 바깥 상자. 보고 있는 구간을 여기서 읽는다. */
  stage: React.RefObject<HTMLDivElement | null>
  /** 자료를 펼친 논리 크기(px). 모두에게 같다. */
  width: number
  height: number
  /** 화면에 맞추려고 씌운 배율. 스크롤 위치를 자료 좌표로 되돌릴 때 쓴다. */
  scale: number
}

/**
 * 자료 위에 덧칠하는 층.
 *
 * 자료 전체를 하나의 캔버스로 보고 그 위 절대 좌표에 그린다. iframe 은 내용
 * 높이만큼 늘려 안쪽 스크롤이 없고, 이 층은 그 위에 같은 크기로 겹친다.
 * 둘을 감싼 바깥이 함께 스크롤하므로 좌표를 맞출 일이 없다.
 *
 * canvas 가 아니라 SVG 로 그린다. 자료가 길면 캔버스 픽셀이 수천만 개가 되어
 * 메모리를 크게 먹는데, 획은 몇 개뿐이라 선으로 두는 편이 가볍고 배율을 씌워도 또렷하다.
 *
 * 도구막대와 단추는 배율이 걸린 상자 밖(body)에 띄운다. 안에 두면 함께
 * 확대·축소되고, transform 이 걸린 조상 안에서는 position:fixed 도 화면이 아니라
 * 그 상자를 기준으로 삼아 자리가 어긋난다.
 */
export default function LiveLayer({ code, presenter, stage, width, height, scale }: Props) {
  const live = useLive(code, true)
  const [mode, setMode] = useState<Mode>('off')
  const [color, setColor] = useState(COLORS[0])
  const [away, setAway] = useState(false)
  const svg = useRef<SVGSVGElement>(null)

  // 그리는 중인 획. 렌더를 다시 돌릴 필요가 없어 state 대신 ref 에 둔다.
  const drawing = useRef<{ id: string; pts: string } | null>(null)
  const lastSend = useRef(0)

  const drawEnabled = presenter && mode !== 'off'

  /**
   * 바깥 상자의 스크롤을 자료 좌표로 옮긴다.
   * scrollHeight 로 역산하면 여백이나 다른 자식 때문에 값이 흔들린다. 배율은
   * 우리가 정한 값이라 흔들리지 않으므로 그것으로 나눈다.
   */
  function visible(el: HTMLDivElement) {
    const k = scale || 1
    return { t: Math.round(el.scrollTop / k), b: Math.round((el.scrollTop + el.clientHeight) / k) }
  }

  // 발표자가 보고 있는 구간을 알린다. 시청자 화면을 움직이지는 않는다.
  useEffect(() => {
    const el = stage.current
    if (!presenter || !el) return
    let last = 0
    const send = () => {
      const now = Date.now()
      if (now - last < 200) return
      last = now
      void sendView(code, visible(el))
    }
    send()
    el.addEventListener('scroll', send, { passive: true })
    return () => el.removeEventListener('scroll', send)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenter, code, stage, scale])

  // 발표자가 보는 곳이 내 화면 밖이면 찾아갈 단추를 띄운다.
  useEffect(() => {
    const el = stage.current
    const view = live.view
    if (presenter || !el || !view) {
      setAway(false)
      return
    }
    const check = () => {
      const { t, b } = visible(el)
      setAway(view.b < t || view.t > b)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    return () => el.removeEventListener('scroll', check)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenter, live.view, stage, scale])

  function goToPresenter() {
    const el = stage.current
    if (!el || !live.view) return
    el.scrollTo({ top: Math.max(0, live.view.t * (scale || 1) - 40), behavior: 'smooth' })
  }

  /** 화면 좌표를 자료 위 절대 좌표로 옮긴다. 배율이 걸려 있어 폭 비율로 나눈다. */
  function at(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect()
    const k = width / r.width
    return {
      x: Math.round((e.clientX - r.left) * k),
      y: Math.round((e.clientY - r.top) * k),
    }
  }

  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  function onDown(e: React.PointerEvent) {
    if (mode !== 'pen') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = at(e)
    drawing.current = { id: newId(), pts: `${x},${y}` }
  }

  function onMove(e: React.PointerEvent) {
    const { x, y } = at(e)
    const now = Date.now()

    if (mode === 'pen' && drawing.current) {
      drawing.current.pts += ` ${x},${y}`
      // 한 획이 규칙 한도에 닿기 전에 끊고 새 획을 잇는다.
      if (drawing.current.pts.length > STROKE_LIMIT) {
        void putStroke(code, drawing.current.id, { pts: drawing.current.pts, c: color, w: 3 })
        drawing.current = { id: newId(), pts: `${x},${y}` }
        return
      }
    }

    if (now - lastSend.current < THROTTLE) return
    lastSend.current = now
    if (mode === 'pen' && drawing.current) {
      void putStroke(code, drawing.current.id, { pts: drawing.current.pts, c: color, w: 3 })
    } else if (mode === 'pointer') {
      void sendPointer(code, x, y)
    }
  }

  function onUp() {
    if (drawing.current) {
      void putStroke(code, drawing.current.id, { pts: drawing.current.pts, c: color, w: 3 })
      drawing.current = null
    }
  }

  // 발표자가 화면을 뜨면 덧칠을 치운다. 남겨두면 다음 사람이 빈 화면에서 유령을 본다.
  useEffect(() => {
    if (!presenter) return
    return () => void clearAll(code)
  }, [presenter, code])

  const controls = (
    <>
      {!presenter && away && (
        <button className="btn sm live-follow" onClick={goToPresenter}>
          발표자 위치로
        </button>
      )}
      {presenter && (
        <div className="live-bar">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`btn sm${mode === m.key ? ' primary' : ' ghost'}`}
              onClick={() => {
                setMode(m.key)
                if (m.key !== 'pointer') void hidePointer(code)
              }}
            >
              {m.label}
            </button>
          ))}
          <span className="live-sep" />
          {COLORS.map((c) => (
            <button
              key={c}
              className={`live-swatch${color === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={`색 ${c}`}
              onClick={() => { setColor(c); setMode('pen') }}
            />
          ))}
          <button className="btn ghost sm" onClick={() => void clearStrokes(code)}>
            지우기
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <svg
        ref={svg}
        className="live-layer"
        width={width}
        height={height}
        style={{ pointerEvents: drawEnabled ? 'auto' : 'none', cursor: mode === 'pen' ? 'crosshair' : 'default' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); if (mode === 'pointer') void hidePointer(code) }}
      >
        {Object.entries(live.strokes).map(([id, s]) => (
          <polyline
            key={id}
            points={s.pts}
            fill="none"
            stroke={s.c}
            strokeWidth={s.w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* 발표자가 보고 있는 구간. 자료를 가리지 않게 오른쪽 가장자리 띠로만 둔다. */}
        {!presenter && live.view && (
          <rect
            className="live-view"
            x={width - 5}
            y={live.view.t}
            width={4}
            height={Math.max(24, live.view.b - live.view.t)}
            rx={2}
          />
        )}
        {live.pointer && (
          <circle className="live-dot" cx={live.pointer.x} cy={live.pointer.y} r={9} />
        )}
      </svg>
      {createPortal(controls, document.body)}
    </>
  )
}
