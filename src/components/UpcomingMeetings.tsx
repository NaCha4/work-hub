import type { CalendarEvent } from '../lib/calendar'
import type { Task } from '../lib/types'

/**
 * 임박한 정도. 색과 글자 크기를 여기 한 곳에서 정한다.
 * 0 지남 · 1 오늘 · 2 내일 · 3 그 이후
 */
type Level = 0 | 1 | 2 | 3

interface Item {
  key: string
  kind: '회의' | '마감'
  /** YYYY-MM-DD */
  date: string
  /** HH:mm. 시각이 없으면 빈 문자열 */
  time: string
  title: string
  link: string
  color?: string
  at: number
  level: Level
  eta: string
}

/** 오늘 자정 기준으로 며칠 뒤인지. 시각이 아니라 날짜로 세야 "오늘" 이 하루 유지된다. */
function dayDiff(date: string, now: number) {
  const start = new Date(`${date}T00:00`).getTime()
  return Math.round((start - new Date(new Date(now).toDateString()).getTime()) / 86400000)
}

/** 시작을 지났으면 진행 중이다. 이미 끝난 일정은 애초에 목록에 들어오지 않는다. */
function measureEvent(date: string, time: string, now: number) {
  const at = new Date(`${date}T${time}`).getTime()
  if (now >= at) return { at, level: 0 as Level, eta: '진행 중' }
  const days = dayDiff(date, now)
  if (days === 0) {
    const min = Math.round((at - now) / 60000)
    return { at, level: 1 as Level, eta: min < 60 ? `${min}분 뒤` : `${Math.floor(min / 60)}시간 뒤` }
  }
  if (days === 1) return { at, level: 2 as Level, eta: '내일' }
  return { at, level: 3 as Level, eta: `D-${days}` }
}

/** 마감은 시각이 없다. 그날 끝을 기준으로 세운다. */
function measureTask(due: string, now: number) {
  const at = new Date(`${due}T23:59`).getTime()
  const days = dayDiff(due, now)
  if (days < 0) return { at, level: 0 as Level, eta: '기한 지남' }
  if (days === 0) return { at, level: 1 as Level, eta: '오늘' }
  if (days === 1) return { at, level: 2 as Level, eta: '내일' }
  return { at, level: 3 as Level, eta: `D-${days}` }
}

interface Props {
  events: CalendarEvent[]
  tasks: Task[]
  max?: number
}

/**
 * 달력이 못 보여주는 것을 맡는 자리다. 달력은 한 달을 고르게 펼치지만
 * 여기서는 회의와 할 일 마감을 한 줄기에 섞고 임박한 순으로만 세운다.
 * 같은 것을 두 번 그리지 않으려고 형태를 일부러 다르게 잡았다.
 */
export default function UpcomingMeetings({ events, tasks, max = 4 }: Props) {
  const now = Date.now()

  const items: Item[] = [
    ...events
      // 종일 일정은 뺀다. 하루를 통째로 차지해서 시간 줄기 위에 놓을 자리가 없고,
      // "몇 시간 뒤" 라는 이 목록의 기준과도 맞지 않는다. 달력에는 그대로 남는다.
      .filter((e) => !e.allDay && e.endsAt > now)
      .map((e) => ({
        key: `e-${e.id}`,
        kind: '회의' as const,
        date: e.date,
        time: e.time,
        title: e.title,
        link: e.link,
        color: e.color,
        ...measureEvent(e.date, e.time, now),
      })),
    ...tasks
      .filter((x) => x.status !== 'done' && x.due)
      .map((x) => ({
        key: `t-${x.id}`,
        kind: '마감' as const,
        date: x.due,
        time: '',
        title: x.title,
        link: '',
        ...measureTask(x.due, now),
      })),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, max)

  return (
    <div className="card upcoming">
      <div className="card-head">
        <h3>다가오는 일정</h3>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>회의와 마감</span>
      </div>

      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>다가오는 회의도 마감도 없습니다.</p>
      ) : (
        <div className="up-rail">
          {items.map((it) => {
            const body = (
              <>
                <span
                  className={`up-mark ${it.kind === '회의' ? 'meet' : 'task'}`}
                  style={it.color ? { background: it.color, borderColor: it.color } : undefined}
                />
                <span className="up-eta">{it.eta}</span>
                <span className="up-when">
                  {it.date.slice(5)}
                  {it.time && ` ${it.time}`}
                </span>
                <span className="up-title">{it.title}</span>
                <span className="up-kind">{it.kind}</span>
              </>
            )
            const cls = `up-row lv${it.level}`
            return it.link ? (
              <a className={cls} key={it.key} href={it.link} target="_blank" rel="noreferrer" title={it.title}>
                {body}
              </a>
            ) : (
              <div className={cls} key={it.key} title={it.title}>{body}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
