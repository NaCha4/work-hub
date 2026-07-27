import { dday } from '../lib/markdown'
import type { CalendarEvent } from '../lib/calendar'

/** 오늘·내일은 D-0/D-1 보다 글자가 빠르게 읽힌다. 그 이후만 D-N 으로 둔다. */
function whenLabel(date: string, today: string) {
  const d = dday(date, today)
  if (d === 'D-day') return '오늘'
  if (d === 'D-1') return '내일'
  return d
}

interface Props {
  events: CalendarEvent[]
  /** YYYY-MM-DD */
  today: string
  max?: number
}

/**
 * 달력을 훑기 전에 눈에 먼저 걸려야 하는 것만 뽑아 놓는 줄.
 * 달력과 같은 자료를 보되 오늘 이후 몇 건만 남긴다.
 */
export default function UpcomingMeetings({ events, today, max = 3 }: Props) {
  const list = events
    .filter((e) => e.date >= today)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, max)

  return (
    <div className="card upcoming">
      <div className="card-head">
        <h3>다가오는 회의</h3>
        <span className="spacer" />
        {list.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>가까운 {list.length}건</span>
        )}
      </div>

      {list.length === 0 && <p className="muted" style={{ margin: 0 }}>예정된 회의가 없습니다.</p>}

      {list.map((e) => {
        const row = (
          <>
            <span className="up-dot" style={e.color ? { background: e.color } : undefined} />
            <span className="up-dday">{whenLabel(e.date, today)}</span>
            <span className="up-when">{e.date.slice(5)} {e.time || '종일'}</span>
            <span className="up-title">{e.title}</span>
          </>
        )
        return e.link ? (
          <a className="up-row" key={e.id} href={e.link} target="_blank" rel="noreferrer" title={e.title}>
            {row}
          </a>
        ) : (
          <div className="up-row" key={e.id} title={e.title}>{row}</div>
        )
      })}
    </div>
  )
}
