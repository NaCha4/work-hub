import { useCallback, useEffect, useRef, useState } from 'react'
import {
  STROKE_LIMIT,
  clearAll,
  clearStrokes,
  hidePointer,
  putStroke,
  sendPointer,
  sendScroll,
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
  frame: React.RefObject<HTMLIFrameElement | null>
}

/**
 * 발표 자료 위에 덧칠하는 층.
 *
 * iframe 안을 건드리지 않는다. 격리 때문에 만질 수도 없고, 만질 필요도 없다.
 * 투명한 캔버스를 자료 위에 겹쳐 그 위에만 그린다.
 *
 * 좌표는 보이는 영역 기준 0~1 이라 화면 크기가 달라도 같은 자리를 가리킨다.
 * 다만 서로 다른 곳을 보고 있으면 소용이 없어서, 발표자의 스크롤 위치를 함께
 * 흘려보내 시청자 화면을 같은 자리로 맞춘다.
 */
export default function LiveLayer({ code, presenter, frame }: Props) {
  const live = useLive(code, true)
  const [mode, setMode] = useState<Mode>('off')
  const [color, setColor] = useState(COLORS[0])
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // 그리는 중인 획. 렌더를 다시 돌릴 필요가 없어 state 대신 ref 에 둔다.
  const drawing = useRef<{ id: string; pts: string } | null>(null)
  const lastSend = useRef(0)

  const drawEnabled = presenter && mode !== 'off'

  /** 캔버스를 지우고 지금 상태를 다시 그린다. 획 수가 적어 통째로 다시 그려도 싸다. */
  const paint = useCallback(() => {
    const el = canvas.current
    const wrap = box.current
    if (!el || !wrap) return
    const { width, height } = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
    }
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of Object.values(live.strokes)) {
      const nums = s.pts.split(' ').filter(Boolean)
      if (nums.length === 0) continue
      ctx.strokeStyle = s.c
      ctx.lineWidth = s.w
      ctx.beginPath()
      nums.forEach((pair, i) => {
        const [x, y] = pair.split(',').map(Number)
        const px = x * width
        const py = y * height
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }
  }, [live.strokes])

  useEffect(() => {
    paint()
    const ro = new ResizeObserver(paint)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [paint])

  // 발표자 화면이 움직이면 그 위치를 흘려보낸다. 시청자 쪽은 받은 위치로 맞춘다.
  useEffect(() => {
    if (!presenter) return
    let last = 0
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; r?: number }
      if (d?.t !== 'wh:scrolled' || typeof d.r !== 'number') return
      const now = Date.now()
      if (now - last < 150) return
      last = now
      void sendScroll(code, d.r)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [presenter, code])

  useEffect(() => {
    if (presenter || live.scroll === null) return
    frame.current?.contentWindow?.postMessage({ t: 'wh:scrollTo', r: live.scroll }, '*')
  }, [presenter, live.scroll, frame])

  // 발표자가 화면을 뜨면 덧칠을 치운다. 남겨두면 다음 사람이 빈 화면에서 유령을 본다.
  useEffect(() => {
    if (!presenter) return
    return () => void clearAll(code)
  }, [presenter, code])

  function at(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect()
    return {
      x: +((e.clientX - r.left) / r.width).toFixed(4),
      y: +((e.clientY - r.top) / r.height).toFixed(4),
    }
  }

  function onDown(e: React.PointerEvent) {
    if (mode !== 'pen') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = at(e)
    drawing.current = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, pts: `${x},${y}` }
  }

  function onMove(e: React.PointerEvent) {
    const { x, y } = at(e)
    const now = Date.now()

    if (mode === 'pen' && drawing.current) {
      drawing.current.pts += ` ${x},${y}`
      // 한 획이 규칙 한도에 닿기 전에 끊고 새 획을 잇는다.
      if (drawing.current.pts.length > STROKE_LIMIT) {
        void putStroke(code, drawing.current.id, { pts: drawing.current.pts, c: color, w: 3 })
        drawing.current = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, pts: `${x},${y}` }
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

  return (
    <>
      <div
        ref={box}
        className="live-layer"
        style={{ pointerEvents: drawEnabled ? 'auto' : 'none', cursor: mode === 'pen' ? 'crosshair' : 'default' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); if (mode === 'pointer') void hidePointer(code) }}
      >
        <canvas ref={canvas} className="live-canvas" />
        {live.pointer && (
          <span
            className="live-dot"
            style={{ left: `${live.pointer.x * 100}%`, top: `${live.pointer.y * 100}%` }}
          />
        )}
      </div>

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
}
