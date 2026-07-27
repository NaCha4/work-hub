import { onValue, ref, remove, set, update } from 'firebase/database'
import { useEffect, useState } from 'react'
import { liveConfigured, rtdb } from './firebase'

/**
 * 발표 중 덧칠(포인터·펜)을 실시간으로 나르는 통로. Realtime Database 를 쓴다.
 *
 * Firestore 가 아닌 이유는 값이 아니라 빈도다. 포인터는 초당 열몇 번 갱신되는데
 * Firestore 는 쓰기 건수로 값을 매겨 발표 한 번에 하루치 무료 한도를 태운다.
 * RTDB 는 오간 양으로 매기므로 이렇게 짧고 잦은 데이터에 맞는다.
 *
 * **좌표는 자료 전체를 하나의 캔버스로 보고 그 위의 절대 위치(px)로 적는다.**
 * 폭은 STAGE_WIDTH 로 고정돼 모두에게 같고, 화면 크기 차이는 배율이 흡수한다.
 * 보이는 영역을 기준으로 삼으면 창 비율이 다른 사람에게 같은 값이 다른 곳을 가리킨다.
 *
 * 발표자가 보고 있는 구간은 덧칠이 아니라 따로 흐르는 값이다(view). 시청자 화면을
 * 끌고 다니지 않고 표시만 하므로, 각자 자유롭게 스크롤하다가 필요할 때 찾아가면 된다.
 *
 * 자료는 여기 없다. 발표본은 Firestore 에 그대로 있고 이 통로에는 덧칠만 흐른다.
 */

export interface Stroke {
  /** "x,y x,y ..." 형태로 이어붙인 자료 위 절대 좌표. 규칙이 2,000자로 자른다. */
  pts: string
  /** 색 */
  c: string
  /** 굵기 */
  w: number
}

/** 발표자가 지금 보고 있는 세로 구간. 자료 위 절대 좌표(px). */
export interface View {
  t: number
  b: number
}

export interface LiveState {
  pointer: { x: number; y: number } | null
  strokes: Record<string, Stroke>
  view: View | null
}

const EMPTY: LiveState = { pointer: null, strokes: {}, view: null }

/** 한 획이 이보다 길어지면 새 획으로 넘긴다. 규칙의 2,000자 한도 아래로 둔다. */
export const STROKE_LIMIT = 1800

const liveRef = (code: string, path = '') =>
  rtdb ? ref(rtdb, `sessions/${code}/live${path}`) : null

/**
 * 세션의 활성 여부와 만료 시각을 RTDB 에도 적는다.
 *
 * RTDB 규칙은 Firestore 를 읽지 못한다. 그래서 이 값이 없으면 규칙이 세션이
 * 살아 있는지 판단할 수 없고, 덧칠 통로가 열리지 않는다.
 * 세션을 만들거나 열고 닫을 때마다 함께 불러야 한다.
 */
export async function syncMeta(
  code: string,
  meta: { ownerUid: string; active: boolean; expiresAt: number },
) {
  if (!rtdb) return
  await set(ref(rtdb, `sessions/${code}/meta`), meta)
}

/** 세션을 지울 때 덧칠도 함께 지운다. 남겨두면 다음에 같은 코드가 나왔을 때 섞인다. */
export async function dropLive(code: string) {
  if (!rtdb) return
  await remove(ref(rtdb, `sessions/${code}`))
}

export async function sendPointer(code: string, x: number, y: number) {
  const r = liveRef(code, '/pointer')
  if (r) await set(r, { x, y })
}

export async function hidePointer(code: string) {
  const r = liveRef(code, '/pointer')
  if (r) await remove(r)
}

/** 발표자가 보고 있는 구간. 시청자를 끌고 가지 않고 어디쯤인지 표시만 한다. */
export async function sendView(code: string, view: View) {
  const node = liveRef(code, '/view')
  if (node) await set(node, view)
}

export async function putStroke(code: string, id: string, stroke: Stroke) {
  const r = liveRef(code, `/strokes/${id}`)
  if (r) await set(r, stroke)
}

export async function clearStrokes(code: string) {
  const r = liveRef(code, '/strokes')
  if (r) await remove(r)
}

/** 발표자가 화면을 뜰 때. 포인터와 획을 함께 치운다. */
export async function clearAll(code: string) {
  const r = liveRef(code)
  if (r) await update(r, { pointer: null, strokes: null })
}

/** 통로를 구독한다. 비로그인 시청자도 그대로 쓴다 — 규칙이 읽기만 열어둔다. */
export function useLive(code: string, enabled: boolean): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY)

  useEffect(() => {
    if (!enabled || !liveConfigured || !rtdb || !code) {
      setState(EMPTY)
      return
    }
    const node = ref(rtdb, `sessions/${code}/live`)
    return onValue(
      node,
      (snap) => {
        const v = (snap.val() ?? {}) as Partial<LiveState>
        setState({
          pointer: v.pointer ?? null,
          strokes: v.strokes ?? {},
          view: v.view ?? null,
        })
      },
      () => {
        // 규칙이 막으면(닫힌 세션·만료) 조용히 빈 상태로 둔다.
        // 왜 막혔는지 알려주면 세션의 상태가 새어 나간다.
        setState(EMPTY)
      },
    )
  }, [code, enabled])

  return state
}
