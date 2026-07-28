import { useMemo, useState } from 'react'
import BarChart, { type Bar } from '../components/BarChart'
import DateInput from '../components/DateInput'
import Modal from '../components/Modal'
import { useAuth } from '../lib/auth'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { parseTags, today, withDow } from '../lib/markdown'
import { MEAL_SLOT_LABEL, type Meal, type MealSlot } from '../lib/types'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

/** 끼니마다 색을 달리해 그래프에서 아침·점심·저녁이 눈으로 갈린다. */
const SLOT_COLOR: Record<MealSlot, string> = {
  breakfast: 'var(--col-review)',
  lunch: 'var(--col-doing)',
  dinner: 'var(--col-done)',
}

const blank = (uid: string, name: string, date: string, slot: MealSlot): Meal => ({
  id: '',
  date,
  slot,
  menu: '',
  place: '',
  note: '',
  tags: [],
  authorUid: uid,
  authorName: name,
  createdAt: 0,
  updatedAt: 0,
})

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/** n일 전 날짜. 통계 구간을 자를 때 쓴다. */
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymd(d)
}

/** 그 날짜가 속한 주의 월요일. 주간 통계의 묶음 기준이다. */
function weekStart(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  // getDay() 는 일요일이 0 이라 월요일 기준으로 옮긴다.
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  return ymd(t)
}

export default function Meals() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Meal>('meals', !!member, byDate)
  const [draft, setDraft] = useState<Meal | null>(null)
  const [span, setSpan] = useState<'week' | 'month'>('week')

  /** 날짜별로 끼니를 모아 하루 한 줄로 보여준다. */
  const byDay = useMemo(() => {
    const map = new Map<string, Partial<Record<MealSlot, Meal>>>()
    for (const m of items) {
      const day = map.get(m.date) ?? {}
      day[m.slot] = m
      map.set(m.date, day)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  const stats = useMemo(() => {
    const since = span === 'week' ? daysAgo(6) : daysAgo(29)
    const inRange = items.filter((m) => m.date >= since)

    // 주간은 날짜별, 월간은 주별로 묶는다. 30칸을 그리면 글자가 읽히지 않는다.
    const buckets = new Map<string, number>()
    if (span === 'week') {
      for (let i = 6; i >= 0; i--) buckets.set(daysAgo(i), 0)
    } else {
      for (let i = 4; i >= 0; i--) buckets.set(weekStart(daysAgo(i * 7)), 0)
    }
    for (const m of inRange) {
      const k = span === 'week' ? m.date : weekStart(m.date)
      if (buckets.has(k)) buckets.set(k, buckets.get(k)! + 1)
    }
    const DOW = ['일', '월', '화', '수', '목', '금', '토']
    const trend: Bar[] = [...buckets.entries()].map(([k, v]) => ({
      key: k,
      label: span === 'week'
        ? DOW[new Date(`${k}T00:00`).getDay()]
        : `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`,
      value: v,
    }))

    const bySlot: Bar[] = SLOTS.map((s) => ({
      key: s,
      label: MEAL_SLOT_LABEL[s],
      value: inRange.filter((m) => m.slot === s).length,
      color: SLOT_COLOR[s],
    }))

    const count = (pick: (m: Meal) => string) => {
      const c = new Map<string, number>()
      for (const m of inRange) {
        const v = pick(m).trim()
        if (v) c.set(v, (c.get(v) ?? 0) + 1)
      }
      return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    }

    const days = span === 'week' ? 7 : 30
    return {
      trend,
      bySlot,
      total: inRange.length,
      // 하루 세 끼를 다 적었을 때가 100% 다.
      rate: Math.round((inRange.length / (days * 3)) * 100),
      topMenu: count((m) => m.menu),
      topPlace: count((m) => m.place),
    }
  }, [items, span])

  function open(date: string, slot: MealSlot, existing?: Meal) {
    setDraft(existing ?? blank(member!.uid, member!.displayName, date, slot))
  }

  async function save() {
    if (!draft) return
    if (!draft.menu.trim()) return alert('먹은 것을 적어 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft
    if (id) await updateDocById('meals', id, data)
    else await createDoc('meals', data)
    setDraft(null)
  }

  async function remove(m: Meal) {
    if (!confirm(`${m.date} ${MEAL_SLOT_LABEL[m.slot]} 기록을 삭제할까요?`)) return
    await deleteDocById('meals', m.id)
    setDraft(null)
  }

  const t = today()
  const hasToday = byDay.some(([d]) => d === t)

  return (
    <div className="page">
      <div className="page-head">
        <h1>식사 일지</h1>
        <span className="spacer" />
        <button className="btn primary" onClick={() => open(t, 'breakfast')}>+ 오늘 식사</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}

      {!loading && items.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>통계</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {span === 'week' ? '최근 7일' : '최근 30일'} · {stats.total}끼 · 기록률 {stats.rate}%
            </span>
            <span className="spacer" />
            <button
              className={`btn sm${span === 'week' ? ' primary' : ' ghost'}`}
              onClick={() => setSpan('week')}
            >
              주간
            </button>
            <button
              className={`btn sm${span === 'month' ? ' primary' : ' ghost'}`}
              onClick={() => setSpan('month')}
            >
              월간
            </button>
          </div>

          <div className="grid cols-2">
            <div>
              <div className="pane-label">{span === 'week' ? '요일별 기록' : '주별 기록'}</div>
              <BarChart bars={stats.trend} max={span === 'week' ? 3 : undefined} unit="끼" />
            </div>
            <div>
              <div className="pane-label">끼니별</div>
              <BarChart bars={stats.bySlot} unit="끼" />
            </div>
          </div>

          {(stats.topMenu.length > 0 || stats.topPlace.length > 0) && (
            <div className="grid cols-2" style={{ marginTop: 14 }}>
              <TopList title="자주 먹은 것" rows={stats.topMenu} />
              <TopList title="자주 간 곳" rows={stats.topPlace} />
            </div>
          )}
        </div>
      )}

      {!hasToday && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>{withDow(t)}</h3>
            <span className="muted" style={{ fontSize: 12 }}>오늘</span>
          </div>
          <div className="meal-row">
            {SLOTS.map((s) => (
              <button key={s} className="meal-slot empty" onClick={() => open(t, s)}>
                <span className="s">{MEAL_SLOT_LABEL[s]}</span>
                <span className="m muted">기록하기</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty">아직 기록이 없습니다. 위에서 오늘 먹은 것을 남겨보세요.</div>
      )}

      {byDay.map(([date, day]) => (
        <div className="card" style={{ marginTop: 16 }} key={date}>
          <div className="card-head">
            <h3>{withDow(date)}</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {SLOTS.filter((s) => day[s]).length} / 3
            </span>
          </div>
          <div className="meal-row">
            {SLOTS.map((s) => {
              const m = day[s]
              return (
                <button
                  key={s}
                  className={`meal-slot${m ? '' : ' empty'}`}
                  style={m ? { borderLeftColor: SLOT_COLOR[s] } : undefined}
                  onClick={() => open(date, s, m)}
                >
                  <span className="s">{MEAL_SLOT_LABEL[s]}</span>
                  {m ? (
                    <>
                      <span className="m">{m.menu}</span>
                      {m.place && <span className="p muted">{m.place}</span>}
                    </>
                  ) : (
                    <span className="m muted">기록하기</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {draft && (
        <Modal
          title={`${MEAL_SLOT_LABEL[draft.slot]} 기록`}
          onClose={() => setDraft(null)}
          onSubmit={save}
          extraActions={
            draft.id ? (
              <button className="btn ghost danger" onClick={() => void remove(draft)}>삭제</button>
            ) : undefined
          }
        >
          <div className="row">
            <div className="field" style={{ flex: '0 0 160px' }}>
              <label>날짜</label>
              <DateInput value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
            </div>
            <div className="field">
              <label>끼니</label>
              <select
                className="select"
                value={draft.slot}
                onChange={(e) => setDraft({ ...draft, slot: e.target.value as MealSlot })}
              >
                {SLOTS.map((s) => <option key={s} value={s}>{MEAL_SLOT_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>먹은 것</label>
            <input
              className="input"
              autoFocus
              value={draft.menu}
              placeholder="예) 김치찌개, 계란말이"
              onChange={(e) => setDraft({ ...draft, menu: e.target.value })}
            />
          </div>
          <div className="field">
            <label>어디서</label>
            <input
              className="input"
              value={draft.place}
              placeholder="집 / 회사 구내식당 / 가게 이름"
              onChange={(e) => setDraft({ ...draft, place: e.target.value })}
            />
          </div>
          <div className="field">
            <label>메모</label>
            <input
              className="input"
              value={draft.note}
              placeholder="맛, 같이 먹은 사람, 가격 등"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <div className="field">
            <label>태그</label>
            <input
              className="input"
              value={draft.tags.join(', ')}
              placeholder="한식, 외식"
              onChange={(e) => setDraft({ ...draft, tags: parseTags(e.target.value) })}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

function TopList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <div className="pane-label">{title}</div>
      {rows.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>—</p>}
      {rows.map(([name, n]) => (
        <div className="top-row" key={name}>
          <span className="t">{name}</span>
          <span className="muted">{n}회</span>
        </div>
      ))}
    </div>
  )
}
