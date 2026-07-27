import type { ReactNode } from 'react'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 한 칸에 이만큼만 보이고 나머지는 숫자로 줄인다. 칸 높이가 들쭉날쭉해지는 것을 막는다. */
const PER_CELL = 3

export interface CalendarItem {
  key: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm. 종일이면 빈 문자열 */
  time: string
  title: string
  /** 구글 캘린더 일정이면 원본 링크, 회의록이면 빈 문자열 */
  link: string
}

interface Props {
  /** YYYY-MM */
  month: string
  /** YYYY-MM-DD */
  today: string
  items: CalendarItem[]
  onShift: (delta: number) => void
  onToday: () => void
  /** 캘린더 연동 상태 문구. 머리줄 오른쪽에 붙는다. */
  status?: ReactNode
}

export default function MonthCalendar({ month, today, items, onShift, onToday, status }: Props) {
  const [y, m] = month.split('-').map(Number)
  const startDow = new Date(y, m - 1, 1).getDay()
  const lastDate = new Date(y, m, 0).getDate()

  const byDate = new Map<string, CalendarItem[]>()
  for (const it of items) {
    const list = byDate.get(it.date)
    if (list) list.push(it)
    else byDate.set(it.date, [it])
  }

  // 앞쪽 빈 칸 + 날짜 칸을 7의 배수로 채워야 마지막 줄이 어긋나지 않는다.
  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const p = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>{y}년 {m}월</h3>
        <button className="btn ghost sm" onClick={() => onShift(-1)} aria-label="이전 달">‹</button>
        <button className="btn ghost sm" onClick={onToday}>오늘</button>
        <button className="btn ghost sm" onClick={() => onShift(1)} aria-label="다음 달">›</button>
        <span className="spacer" />
        {status}
      </div>

      <div className="cal-grid">
        {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div className="cal-cell empty" key={`b${i}`} />
          const date = `${y}-${p(m)}-${p(day)}`
          const list = byDate.get(date) ?? []
          return (
            <div className={`cal-cell${date === today ? ' today' : ''}`} key={date}>
              <div className="cal-day">{day}</div>
              {list.slice(0, PER_CELL).map((it) => {
                const label = it.time ? `${it.time} ${it.title}` : it.title
                return it.link ? (
                  <a className="cal-ev" key={it.key} href={it.link} target="_blank" rel="noreferrer" title={label}>
                    {label}
                  </a>
                ) : (
                  <span className="cal-ev own" key={it.key} title={label}>{label}</span>
                )
              })}
              {list.length > PER_CELL && (
                <span className="cal-more">+{list.length - PER_CELL}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
