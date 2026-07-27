import { useState, type ReactNode } from 'react'
import Modal from './Modal'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 한 칸에 이만큼만 놓고 나머지는 하루 보기로 넘긴다. 칸 높이가 흔들리면 달력이 무너진다. */
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
  /** 구글에서 지정한 색. 없으면 기본 강조색으로 둔다. */
  color?: string
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

/** 시각 칸을 항상 같은 너비로 두어야 제목이 세로로 정렬돼 훑어보기 쉽다. */
function Entry({ item, onOpen }: { item: CalendarItem; onOpen?: () => void }) {
  const body = (
    <>
      <span className="tm">{item.time || '종일'}</span>
      <span className="tt">{item.title}</span>
    </>
  )
  const cls = `cal-ev${item.link ? '' : ' own'}`
  // 구글에서 정한 색을 그대로 쓴다. 캘린더 화면과 색이 다르면 같은 일정을 못 알아본다.
  const style = item.color ? { borderLeftColor: item.color } : undefined
  return item.link ? (
    <a
      className={cls}
      style={style}
      href={item.link}
      target="_blank"
      rel="noreferrer"
      title={item.title}
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </a>
  ) : (
    <span className={cls} style={style} title={item.title} onClick={onOpen}>{body}</span>
  )
}

export default function MonthCalendar({ month, today, items, onShift, onToday, status }: Props) {
  const [day, setDay] = useState<string | null>(null)
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
  const dayItems = day ? (byDate.get(day) ?? []) : []

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
        {DOW.map((d, i) => (
          <div className={`cal-dow${i === 0 || i === 6 ? ' weekend' : ''}`} key={d}>{d}</div>
        ))}
        {cells.map((date, i) => {
          if (date === null) return <div className="cal-cell empty" key={`b${i}`} />
          const ymd = `${y}-${p(m)}-${p(date)}`
          const list = byDate.get(ymd) ?? []
          const dow = i % 7
          const cls = [
            'cal-cell',
            dow === 0 || dow === 6 ? 'weekend' : '',
            ymd === today ? 'today' : '',
            list.length > 0 ? 'has' : '',
          ]
          return (
            <div
              className={cls.filter(Boolean).join(' ')}
              key={ymd}
              onClick={() => list.length > 0 && setDay(ymd)}
            >
              <div className="cal-day">{date}</div>
              {list.slice(0, PER_CELL).map((it) => (
                <Entry key={it.key} item={it} onOpen={() => setDay(ymd)} />
              ))}
              {list.length > PER_CELL && (
                <span className="cal-more">+{list.length - PER_CELL}건 더</span>
              )}
            </div>
          )
        })}
      </div>

      {day && (
        <Modal title={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`} onClose={() => setDay(null)}>
          {dayItems.length === 0 && <p className="muted">일정이 없습니다.</p>}
          {dayItems.map((it) => (
            <div className="day-row" key={it.key}>
              <span className="tm">{it.time || '종일'}</span>
              {it.link ? (
                <a href={it.link} target="_blank" rel="noreferrer">{it.title}</a>
              ) : (
                <span>{it.title}</span>
              )}
              <span className="spacer" />
              <span className="src">{it.link ? '구글 캘린더' : '회의록'}</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}
