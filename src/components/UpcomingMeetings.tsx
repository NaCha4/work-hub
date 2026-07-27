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

/**
 * 남은 시간을 사람이 쓰는 말로 바꾼다.
 * 시각이 없는 항목은 그날 끝을 기준으로 삼아야 "오늘" 이 하루 종일 유지된다.
 */
function measure(date: string, time: string, now: number, kind: Item['kind']) {
  const at = new Date(`${date}T${time || '23:59'}`).getTime()
  const min = Math.round((at - now) / 60000)
  const days = Math.round(
    (new Date(`${date}T00:00`).getTime() - new Date(new Date(now).toDateString()).getTime()) /
      86400000,
  )

  let level: Level = 3
  let eta = `D-${days}`
  if (min < 0) {
    level = 0
    eta = kind === '회의' ? '지남' : '기한 지남'
  } else if (days === 0) {
    level = 1
    eta = min < 60 ? `${min}분 뒤` : `${Math.floor(min / 60)}시간 뒤`
  } else if (days === 1) {
    level = 2
    eta = '내일'
  }
  return { at, level, eta }
}

interface Props {
  events: CalendarEvent[]
  tasks: Task[]
  /** YYYY-MM-DD */
  today: string
  max?: number
}

/**
 * 달력이 못 보여주는 것을 맡는 자리다. 달력은 한 달을 고르게 펼치지만
 * 여기서는 회의와 할 일 마감을 한 줄기에 섞고 임박한 순으로만 세운다.
 * 같은 것을 두 번 그리지 않으려고 형태를 일부러 다르게 잡았다.
 */
export default function UpcomingMeetings({ events, tasks, today, max = 4 }: Props) {
  const now = Date.now()

  const items: Item[] = [
    ...events
      .filter((e) => e.date >= today)
      .map((e) => ({
        key: `e-${e.id}`,
        kind: '회의' as const,
        date: e.date,
        time: e.time,
        title: e.title,
        link: e.link,
        color: e.color,
        ...measure(e.date, e.time, now, '회의'),
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
        ...measure(x.due, '', now, '마감'),
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
