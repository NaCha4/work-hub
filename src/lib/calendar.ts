import { useCallback, useEffect, useState } from 'react'

/**
 * 구글 캘린더 읽기 전용 연동.
 *
 * Firestore 를 거치지 않는다. 일정은 화면에 띄우기만 하고 저장하지 않으므로
 * 보안 규칙에 새 match 블록이 필요 없다. 쓰기 권한도 요청하지 않아서
 * 이 앱이 사용자의 캘린더를 바꿀 수 있는 경로 자체가 없다.
 *
 * 토큰은 이 모듈의 메모리에만 둔다. localStorage 나 Firestore 에 넣지 않는다 —
 * 저장소가 공개고, 규칙으로 감쌀 수 있는 값도 아니다. 탭을 새로 열면 다시 받는다.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/** 클라이언트 ID 가 없으면 연동 자체를 없는 기능으로 취급한다. */
export const calendarConfigured = Boolean(CLIENT_ID)

export interface CalendarEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm. 종일 일정이면 빈 문자열 */
  time: string
  allDay: boolean
  /** 끝나는 시각 (ms). 진행 중인지 이미 끝났는지 가리는 데 쓴다. */
  endsAt: number
  link: string
  /** 구글에서 지정한 색. 일정에 색이 따로 없으면 그 캘린더의 색이다. */
  color: string
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

let token = ''
let expiresAt = 0
let client: TokenClient | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
let inflight: Promise<string> | null = null
let scriptLoad: Promise<void> | null = null

/** GIS 가 콜백을 영영 부르지 않는 경우가 있다. 그대로 두면 화면이 "확인 중" 에 굳는다. */
const TIMEOUT_MS = 20_000

/** Google Identity Services 스크립트. npm 패키지가 없어 태그로 넣는다. */
function loadScript() {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptLoad = null
      reject(new Error('구글 인증 스크립트를 불러오지 못했습니다.'))
    }
    document.head.appendChild(s)
  })
  return scriptLoad
}

function settle(result: { token: string } | { error: string }) {
  const p = pending
  pending = null
  if (!p) return
  if ('token' in result) p.resolve(result.token)
  else p.reject(new Error(result.error))
}

/**
 * interactive=false 면 이미 동의한 계정에 한해 팝업 없이 새 토큰을 받는다.
 * 동의 이력이 없으면 구글이 팝업을 띄우려다 브라우저에 막히고, 그때는
 * 사용자가 연동 버튼을 눌러 interactive=true 로 다시 오게 된다.
 */
async function getToken(interactive: boolean): Promise<string> {
  if (token && Date.now() < expiresAt) return token
  // 창 포커스마다 조용한 갱신이 겹칠 수 있다. 이미 떠 있는 요청이 있으면 함께 기다린다.
  if (inflight && !interactive) return inflight

  await loadScript()
  const oauth2 = window.google?.accounts.oauth2
  if (!oauth2) throw new Error('구글 인증 스크립트를 불러오지 못했습니다.')

  client ??= oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (res) => {
      if (!res.access_token) return settle({ error: res.error ?? '토큰을 받지 못했습니다.' })
      token = res.access_token
      // 만료 1분 전부터는 새로 받는다. 요청 도중 만료되는 것을 피한다.
      expiresAt = Date.now() + (res.expires_in ?? 3600) * 1000 - 60_000
      settle({ token })
    },
    error_callback: (err) => settle({ error: err.type ?? '인증 창이 열리지 않았습니다.' }),
  })

  // 앞선 요청이 남아 있으면 먼저 정리한다. 그대로 덮어쓰면 그 약속이 영영 안 풀린다.
  settle({ error: '새 요청으로 대체되었습니다.' })

  inflight = new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    const timer = setTimeout(
      () => settle({ error: '구글 인증이 응답하지 않았습니다. 연동 버튼을 눌러 다시 시도해 주세요.' }),
      TIMEOUT_MS,
    )
    const done = () => clearTimeout(timer)
    pending = {
      resolve: (t) => { done(); resolve(t) },
      reject: (e) => { done(); reject(e) },
    }
    client!.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

interface RawEvent {
  id?: string
  summary?: string
  htmlLink?: string
  colorId?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

/** 종일 일정의 end.date 는 다음 날이다(끝을 포함하지 않는다). 그대로 자정으로 읽으면 맞다. */
function endMs(end: RawEvent['end'], fallback: number) {
  if (end?.dateTime) return new Date(end.dateTime).getTime()
  if (end?.date) return new Date(`${end.date}T00:00`).getTime()
  return fallback
}

function toEvent(item: RawEvent, color: string): CalendarEvent | null {
  const start = item.start
  if (!start) return null
  const base = {
    id: item.id ?? '',
    title: item.summary ?? '(제목 없음)',
    link: item.htmlLink ?? '',
    color,
  }
  if (start.date) {
    return {
      ...base,
      date: start.date,
      time: '',
      allDay: true,
      endsAt: endMs(item.end, new Date(`${start.date}T23:59`).getTime()),
    }
  }
  if (!start.dateTime) return null
  const d = new Date(start.dateTime)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    ...base,
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    allDay: false,
    // 끝 시각이 없는 일정은 한 시간짜리로 친다. 진행 중 표시가 영영 안 꺼지는 것보다 낫다.
    endsAt: endMs(item.end, d.getTime() + 3600_000),
  }
}

/** colorId → 색 표. 좀처럼 바뀌지 않으므로 한 번만 받아 들고 있는다. */
let eventColors: Record<string, string> | null = null

async function loadEventColors(t: string) {
  if (eventColors) return eventColors
  try {
    const res = await api<{ event?: Record<string, { background?: string }> }>('/colors', t)
    eventColors = Object.fromEntries(
      Object.entries(res.event ?? {}).map(([k, v]) => [k, v.background ?? '']),
    )
  } catch {
    // 색을 못 받아도 일정은 보여야 한다. 캘린더 색으로 넘어간다.
    eventColors = {}
  }
  return eventColors
}

const API = 'https://www.googleapis.com/calendar/v3'

async function api<T>(path: string, t: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })
  if (!res.ok) {
    // 권한이 끊겼으면 캐시한 토큰을 버려 다음 시도에서 새로 받게 한다.
    if (res.status === 401 || res.status === 403) {
      token = ''
      expiresAt = 0
    }
    throw new Error(`캘린더를 불러오지 못했습니다. (${res.status})`)
  }
  return (await res.json()) as T
}

/**
 * 공휴일·생일처럼 구글이 자동으로 붙여주는 캘린더는 뺀다.
 * 회의 목록에 "성탄절" 이 끼면 쓸모가 없어진다.
 */
function isNoise(id: string) {
  return id.includes('holiday@group') || id.includes('#contacts@group')
}

/** month 는 'YYYY-MM'. 그 달 1일 0시부터 다음 달 1일 0시까지를 본다. */
async function fetchMonth(interactive: boolean, month: string): Promise<CalendarEvent[]> {
  const t = await getToken(interactive)

  // primary 하나만 보면 조직 계정에서 흔한 공유·부 캘린더의 일정을 통째로 놓친다.
  const list = await api<{
    items?: { id?: string; deleted?: boolean; backgroundColor?: string }[]
  }>('/users/me/calendarList?maxResults=250&minAccessRole=reader', t)
  const cals = (list.items ?? [])
    .filter((c) => c.id && !c.deleted && !isNoise(c.id))
    .map((c) => ({ id: c.id as string, color: c.backgroundColor ?? '' }))
  const colors = await loadEventColors(t)

  const [y, m] = month.split('-').map(Number)
  const timeMin = new Date(y, m - 1, 1).toISOString()
  // 달력은 이 달만 그리지만, 월말에 서 있어도 "다가오는 회의" 가 비지 않도록
  // 다음 달까지 함께 받아둔다. 달력 칸은 이 달 날짜만 찾아 쓰므로 남는 건 무시된다.
  const timeMax = new Date(y, m + 1, 1).toISOString()
  const query =
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    // 반복 일정을 회차별로 펼쳐야 날짜 칸에 하나씩 놓을 수 있다.
    `&maxResults=250&singleEvents=true&orderBy=startTime`

  // 캘린더 하나가 막혀 있어도 나머지는 보여준다.
  const results = await Promise.allSettled(
    cals.map((c) =>
      api<{ items?: RawEvent[] }>(`/calendars/${encodeURIComponent(c.id)}/events${query}`, t)
        // 일정에 색을 따로 주지 않았으면 그 캘린더의 색을 쓴다. 구글 화면과 같은 규칙이다.
        .then((r) => (r.items ?? []).map((it) => toEvent(it, colors[it.colorId ?? ''] || c.color))),
    ),
  )

  const events = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((e): e is CalendarEvent => e !== null)

  // 같은 회의가 여러 캘린더에 걸쳐 있으면 id 가 겹친다. 화면에서 두 번 보이는 것도,
  // 리스트 key 가 충돌하는 것도 막아야 한다.
  return [...new Map(events.map((e) => [e.id, e])).values()].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  )
}

export type CalendarState = 'off' | 'loading' | 'ready' | 'error'

/** month 는 'YYYY-MM'. 달을 넘기면 그 달을 다시 받아온다. */
export function useCalendarEvents(month: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [state, setState] = useState<CalendarState>(calendarConfigured ? 'loading' : 'off')
  const [error, setError] = useState('')

  const load = useCallback(
    async (interactive: boolean) => {
      if (!calendarConfigured) return
      setState('loading')
      try {
        setEvents(await fetchMonth(interactive, month))
        setError('')
        setState('ready')
      } catch (e) {
        setError((e as Error).message)
        setState('error')
      }
    },
    [month],
  )

  useEffect(() => {
    void load(false)
    // 탭을 오래 열어두면 목록이 굳는다. 돌아올 때 조용히 다시 받는다.
    const onFocus = () => void load(false)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  return { events, state, error, connect: () => void load(true) }
}
