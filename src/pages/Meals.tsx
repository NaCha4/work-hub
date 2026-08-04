import { useMemo, useState, type CSSProperties } from 'react'
import BarChart, { type Bar } from '../components/BarChart'
import DateInput from '../components/DateInput'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { useAuth } from '../lib/auth'
import { byDate, createDoc, deleteDocById, updateDocById, useCollection } from '../lib/db'
import { today, withDow } from '../lib/markdown'
import { MEAL_SLOT_LABEL, type Meal, type MealSlot } from '../lib/types'

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

/** 끼니마다 색을 달리해 목록에서 아침·점심·저녁이 눈으로 갈린다. */
const SLOT_COLOR: Record<MealSlot, string> = {
  breakfast: 'var(--col-review)',
  lunch: 'var(--col-doing)',
  dinner: 'var(--col-done)',
}

/**
 * 음식 종류. 자유 입력으로 두면 "한식"과 "한식 "처럼 조금씩 다르게 적혀
 * 통계가 흩어진다. 고르게 해서 집계가 성립하게 한다.
 * 목록은 임의로 정한 것이니 필요하면 늘리고 줄인다.
 */
const KINDS = [
  '한식', '고기구이', '중식', '일식', '양식', '분식',
  '아시안', '패스트푸드', '카페·디저트', '도시락·간편식', '기타',
] as const

/** 종류가 여럿일 때 막대를 눈으로 가르려고 색을 돌려 쓴다. */
const KIND_COLORS = [
  'var(--accent)', 'var(--col-doing)', 'var(--col-done)',
  'var(--col-review)', 'var(--col-todo)',
]

/**
 * 종류마다 늘 같은 색을 준다. 순위대로 칠하면 구간을 바꿀 때마다 한식이
 * 파랑이었다 빨강이 되어, 사람별 그래프와 종류 그래프를 눈으로 잇지 못한다.
 */
function kindColor(kind: string) {
  const i = KINDS.indexOf(kind as (typeof KINDS)[number])
  return i >= 0 ? KIND_COLORS[i % KIND_COLORS.length] : 'var(--muted)'
}

/** 장소 이름으로 색을 정해 통계 기간이나 순위가 바뀌어도 같은 장소는 같은 색을 쓴다. */
function placeColor(place: string) {
  let hash = 0
  for (const char of place) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return KIND_COLORS[hash % KIND_COLORS.length]
}

const SPANS = [
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'all', label: '전체' },
] as const

type Span = (typeof SPANS)[number]['key']
type MealScope = MealSlot | 'all'
const MEAL_SCOPES: MealScope[] = [...SLOTS, 'all']

function indicatorStyle(index: number, count: number): CSSProperties {
  return {
    width: `calc(${100 / count}% - ${4 / count}px)`,
    transform: `translateX(${index * 100}%)`,
  }
}

const blank = (uid: string, name: string, date: string, slot: MealSlot): Meal => ({
  id: '',
  date,
  slot,
  menu: '',
  place: '',
  chooser: '',
  note: '',
  tags: [],
  authorUid: uid,
  authorName: name,
  createdAt: 0,
  updatedAt: 0,
})

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/** 날짜 문자열을 현지 시각 자정으로 읽는다. UTC 로 읽으면 한국에서 날짜가 어긋날 수 있다. */
function dateOf(value: string) {
  const [year, month, date] = value.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** 월요일부터 일요일까지를 한 주로 본다. */
function weekStart(value: string) {
  const d = dateOf(value)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}

function weekEnd(start: string) {
  const d = dateOf(start)
  d.setDate(d.getDate() + 6)
  return ymd(d)
}

/** 월요일 시작 달력에서 이 날짜가 몇 번째 행에 놓이는지 센다. */
function weekOfMonth(value: string) {
  const d = dateOf(value)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  return Math.ceil((d.getDate() + offset) / 7)
}

const WEEK_ORDINAL = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째']

function weekPart(value: string, withYear: boolean) {
  const d = dateOf(value)
  const year = withYear ? `${d.getFullYear()}년 ` : ''
  return `${year}${d.getMonth() + 1}월 ${WEEK_ORDINAL[weekOfMonth(value) - 1]}주`
}

function weekLabel(start: string, withYear = false) {
  const end = weekEnd(start)
  const startMonth = start.slice(0, 7)
  const endMonth = end.slice(0, 7)
  if (startMonth === endMonth) return weekPart(start, withYear)
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4)
  return `${weekPart(start, withYear || crossesYear)} / ${weekPart(end, withYear || crossesYear)}`
}

function monthLabel(month: string, withYear: boolean) {
  const [year, number] = month.split('-').map(Number)
  return `${withYear ? `${year}년 ` : ''}${number}월`
}

function shiftWeek(start: string, delta: number) {
  const d = dateOf(start)
  d.setDate(d.getDate() + delta * 7)
  return ymd(d)
}

function shiftMonth(month: string, delta: number) {
  const d = dateOf(`${month}-01`)
  d.setMonth(d.getMonth() + delta)
  return ymd(d).slice(0, 7)
}

export default function Meals() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Meal>('meals', !!member, byDate)
  const [draft, setDraft] = useState<Meal | null>(null)
  const [span, setSpan] = useState<Span>('week')
  const [mealScope, setMealScope] = useState<MealScope>('all')
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7))
  const [selectedWeek, setSelectedWeek] = useState(weekStart(today()))

  /**
   * 한 날짜의 한 끼니는 기록 하나여야 한다. 실수로 두 번 적히면 화면에는 하나만
   * 보이는데 통계는 둘을 세어 숫자가 어긋난다. 가장 최근에 고친 것만 남기고
   * 나머지는 따로 모아 두었다가 정리할 수 있게 한다.
   */
  const { unique, dupes } = useMemo(() => {
    const keep = new Map<string, Meal>()
    const extra: Meal[] = []
    for (const m of items) {
      const k = `${m.date}|${m.slot}`
      const cur = keep.get(k)
      if (!cur) keep.set(k, m)
      else if ((m.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { extra.push(cur); keep.set(k, m) }
      else extra.push(m)
    }
    return { unique: [...keep.values()], dupes: extra }
  }, [items])

  /** 날짜별로 끼니를 모아 하루 한 줄로 보여준다. */
  const byDay = useMemo(() => {
    const map = new Map<string, Partial<Record<MealSlot, Meal>>>()
    for (const m of unique) {
      const day = map.get(m.date) ?? {}
      day[m.slot] = m
      map.set(m.date, day)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [unique])

  /** 이미 적어둔 사람 이름. 입력 칸에서 골라 넣도록 모아 둔다. */
  const choosers = useMemo(
    () => [...new Set(unique.map((m) => (m.chooser ?? '').trim()).filter(Boolean))].sort(),
    [unique],
  )

  const dupeByDate = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of dupes) c.set(m.date, (c.get(m.date) ?? 0) + 1)
    return c
  }, [dupes])

  const periodSamples = useMemo(
    () => mealScope === 'all' ? unique : unique.filter((m) => m.slot === mealScope),
    [unique, mealScope],
  )
  const sampleDates = useMemo(
    () => periodSamples.map((m) => m.date).sort(),
    [periodSamples],
  )
  const periodYears = new Set([
    ...unique.map((m) => m.date.slice(0, 4)),
    selectedMonth.slice(0, 4),
    selectedWeek.slice(0, 4),
  ])
  const showMonthYear = periodYears.size > 1
  const showWeekYear = periodYears.size > 1
  const currentWeekEnd = weekEnd(selectedWeek)
  const pickerDate = periodSamples.find((m) => span === 'week'
    ? m.date >= selectedWeek && m.date <= currentWeekEnd
    : m.date.startsWith(selectedMonth))?.date ?? ''

  const hasPeriodSample = (key: string) => {
    if (span === 'week') {
      const end = weekEnd(key)
      return periodSamples.some((m) => m.date >= key && m.date <= end)
    }
    return periodSamples.some((m) => m.date.startsWith(key))
  }

  const adjacentPeriod = (delta: number) => span === 'week'
    ? shiftWeek(selectedWeek, delta)
    : shiftMonth(selectedMonth, delta)

  function movePeriod(delta: number) {
    const target = adjacentPeriod(delta)
    if (!hasPeriodSample(target)) return
    if (span === 'week') setSelectedWeek(target)
    else if (span === 'month') setSelectedMonth(target)
  }

  function pickPeriod(value: string) {
    if (!value || span === 'all') return
    const target = span === 'week' ? weekStart(value) : value.slice(0, 7)
    if (!hasPeriodSample(target)) {
      alert('선택한 기간에는 기록이 없습니다.')
      return
    }
    if (span === 'week') setSelectedWeek(target)
    else setSelectedMonth(target)
  }

  const stats = useMemo(() => {
    const selectedWeekEnd = weekEnd(selectedWeek)
    const inPeriod = unique.filter((m) => {
      if (span === 'all') return true
      if (span === 'month') return m.date.startsWith(selectedMonth)
      return m.date >= selectedWeek && m.date <= selectedWeekEnd
    })
    const inRange = mealScope === 'all'
      ? inPeriod
      : inPeriod.filter((m) => m.slot === mealScope)

    /** 값별로 세어 많은 순으로 세운다. 칸이 너무 많으면 글자가 읽히지 않아 자른다. */
    const rank = (pick: (m: Meal) => string, cap: number): Bar[] => {
      const c = new Map<string, number>()
      for (const m of inRange) {
        const v = pick(m).trim()
        if (v) c.set(v, (c.get(v) ?? 0) + 1)
      }
      return [...c.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, cap)
        .map(([label, value]) => ({ key: label, label, value, color: kindColor(label) }))
    }

    /**
     * 누가 무엇을 골랐는지. 사람마다 종류별 개수를 세어 많이 고른 순으로 세운다.
     * 추천인을 안 적은 기록은 셀 대상이 없으므로 빠진다.
     */
    const byChooser = (() => {
      const per = new Map<string, Map<string, number>>()
      for (const m of inRange) {
        const who = (m.chooser ?? '').trim()
        const kind = (m.tags[0] ?? '').trim()
        if (!who || !kind) continue
        const c = per.get(who) ?? new Map<string, number>()
        c.set(kind, (c.get(kind) ?? 0) + 1)
        per.set(who, c)
      }
      return [...per.entries()]
        .map(([who, c]) => ({
          who,
          total: [...c.values()].reduce((a, b) => a + b, 0),
          kinds: [...c.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([kind, n]) => ({ kind, n })),
        }))
        .sort((a, b) => b.total - a.total || a.who.localeCompare(b.who))
        .slice(0, 6)
    })()

    return {
      // 종류는 고른 값 하나만 쓰므로 첫 칸을 본다.
      byKind: rank((m) => m.tags[0] ?? '', 8),
      byPlace: rank((m) => m.place, 8).map((b) => ({ ...b, color: placeColor(b.key) })),
      byChooser,
    }
  }, [unique, span, mealScope, selectedMonth, selectedWeek])

  const find = (date: string, slot: MealSlot) =>
    unique.find((m) => m.date === date && m.slot === slot)

  /** 이미 적어둔 끼니면 그 기록을 연다. 빈 창을 열면 같은 자리에 하나가 더 생긴다. */
  function open(date: string, slot: MealSlot, existing?: Meal) {
    const found = existing ?? find(date, slot)
    setDraft(found ?? blank(member!.uid, member!.displayName, date, slot))
  }

  /** 오늘 아직 안 적은 첫 끼니를 연다. 다 적었으면 아침 기록을 연다. */
  function openToday() {
    const t = today()
    const empty = SLOTS.find((s) => !find(t, s))
    open(t, empty ?? 'breakfast')
  }

  async function save() {
    if (!draft) return
    if (!draft.menu.trim()) return alert('먹은 것을 적어 주세요.')
    const { id, createdAt: _c, updatedAt: _u, ...data } = draft

    // 창 안에서 날짜나 끼니를 바꿔 이미 있는 자리로 옮기는 경우까지 막는다.
    const clash = unique.find(
      (m) => m.date === draft.date && m.slot === draft.slot && m.id !== id,
    )
    if (clash) {
      const moving = !!id
      const ok = confirm(
        `${draft.date} ${MEAL_SLOT_LABEL[draft.slot]} 기록이 이미 있습니다.\n` +
          `그 기록을 지금 내용으로 바꿀까요?` +
          (moving ? '\n\n원래 자리의 기록은 삭제됩니다.' : ''),
      )
      if (!ok) return
      await updateDocById('meals', clash.id, data)
      if (moving) await deleteDocById('meals', id)
      setDraft(null)
      return
    }

    if (id) await updateDocById('meals', id, data)
    else await createDoc('meals', data)
    setDraft(null)
  }

  /** 이미 쌓인 중복을 치운다. 남기는 것은 가장 최근에 고친 기록이다. */
  async function cleanDupes(date: string) {
    const targets = dupes.filter((m) => m.date === date)
    if (targets.length === 0) return
    if (!confirm(`${date} 의 중복 기록 ${targets.length}건을 삭제할까요?\n가장 최근에 고친 기록만 남습니다.`)) return
    await Promise.all(targets.map((m) => deleteDocById('meals', m.id)))
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
        <button className="btn primary" onClick={openToday}>+ 오늘 식사</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">불러오는 중…</p>}

      {!loading && items.length > 0 && (
        <div className="card meal-stats-card">
          <div className="meal-stats-title">
            <h3>통계</h3>
            <span className="muted">
              {span === 'all'
                ? '전체 기간'
                : span === 'month'
                  ? monthLabel(selectedMonth, showMonthYear)
                  : weekLabel(selectedWeek, showWeekYear)}
              {' · '}
              {mealScope === 'all' ? '전체 끼니' : MEAL_SLOT_LABEL[mealScope]}
            </span>
          </div>

          <div className="meal-stats-controls">
            <div className="meal-control-row">
              <span className="meal-control-label">기간</span>
              {span !== 'all' && (
                <span className="meal-period-nav">
                  <button
                    type="button"
                    className="meal-period-arrow"
                    aria-label={span === 'week' ? '이전 주' : '이전 달'}
                    disabled={!hasPeriodSample(adjacentPeriod(-1))}
                    onClick={() => movePeriod(-1)}
                  >
                    <Icon name="chevron-left" size={15} />
                  </button>
                  <label className="meal-period-picker">
                    <Icon name="calendar" size={14} />
                    <span>
                      {span === 'week'
                        ? weekLabel(selectedWeek, showWeekYear)
                        : monthLabel(selectedMonth, showMonthYear)}
                    </span>
                    <input
                      type="date"
                      aria-label={span === 'week' ? '통계 주 선택' : '통계 월 선택'}
                      value={pickerDate}
                      min={sampleDates[0]}
                      max={sampleDates[sampleDates.length - 1]}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onChange={(e) => pickPeriod(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="meal-period-arrow"
                    aria-label={span === 'week' ? '다음 주' : '다음 달'}
                    disabled={!hasPeriodSample(adjacentPeriod(1))}
                    onClick={() => movePeriod(1)}
                  >
                    <Icon name="chevron-right" size={15} />
                  </button>
                </span>
              )}
              {span === 'all' && <span className="meal-period-all muted">모든 기록</span>}
              <span className="spacer" />
              <span className="meal-segmented" role="group" aria-label="통계 기간 단위">
                <i
                  className="meal-segment-indicator"
                  style={indicatorStyle(SPANS.findIndex((s) => s.key === span), SPANS.length)}
                  aria-hidden="true"
                />
                {SPANS.map((s) => (
                  <button
                    key={s.key}
                    className={span === s.key ? 'active' : ''}
                    onClick={() => setSpan(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </div>

            <div className="meal-control-row">
              <span className="meal-control-label">끼니</span>
              <span className="meal-segmented" role="group" aria-label="통계 끼니">
                <i
                  className="meal-segment-indicator"
                  style={indicatorStyle(MEAL_SCOPES.indexOf(mealScope), MEAL_SCOPES.length)}
                  aria-hidden="true"
                />
                {MEAL_SCOPES.map((scope) => (
                  <button
                    key={scope}
                    className={mealScope === scope ? 'active' : ''}
                    onClick={() => setMealScope(scope)}
                  >
                    {scope === 'all' ? '전체' : MEAL_SLOT_LABEL[scope]}
                  </button>
                ))}
              </span>
            </div>
          </div>

          <div className="grid cols-2 meal-stat-grid">
            <div className="meal-stat-panel">
              <div className="pane-label">음식 종류</div>
              {stats.byKind.length > 0
                ? <BarChart bars={stats.byKind} unit="번" />
                : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>종류를 고른 기록이 없습니다.</p>}
            </div>
            <div className="meal-stat-panel">
              <div className="pane-label">자주 간 곳</div>
              {stats.byPlace.length > 0
                ? <BarChart bars={stats.byPlace} unit="번" />
                : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>장소를 적은 기록이 없습니다.</p>}
            </div>
          </div>

          <div className="meal-stat-panel meal-recommender-stat">
            <div className="pane-label">추천인별 종류</div>
            {stats.byChooser.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                추천인과 종류를 함께 적은 기록이 없습니다.
              </p>
            ) : (
              stats.byChooser.map((row) => (
                <div className="who-row" key={row.who}>
                  <span className="who">{row.who}</span>
                  {/* 한 줄을 종류별로 나눠 칠한다. 색은 위 종류 그래프와 같다. */}
                  <span className="who-bar">
                    {row.kinds.map((k) => (
                      <i
                        key={k.kind}
                        style={{ flex: k.n, background: kindColor(k.kind) }}
                        title={`${k.kind} ${k.n}번`}
                      />
                    ))}
                  </span>
                  <span className="who-sum muted">{row.total}번</span>
                  <span className="who-detail muted">
                    {row.kinds.map((k) => `${k.kind} ${k.n}`).join(' · ')}
                  </span>
                </div>
              ))
            )}
          </div>
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
            {!!dupeByDate.get(date) && (
              <>
                <span className="spacer" />
                <button className="btn ghost sm danger" onClick={() => void cleanDupes(date)}>
                  중복 {dupeByDate.get(date)}건 정리
                </button>
              </>
            )}
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
                      <span className="p muted">
                        {[m.tags[0], m.place].filter(Boolean).join(' · ')}
                      </span>
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
          <div className="row">
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
              <label>추천인</label>
              <input
                className="input"
                list="wh-choosers"
                value={draft.chooser ?? ''}
                placeholder="메뉴를 추천한 사람"
                onChange={(e) => setDraft({ ...draft, chooser: e.target.value })}
              />
              {/* 한 번 적은 이름은 다음부터 골라 넣게 해 표기가 흩어지지 않게 한다. */}
              <datalist id="wh-choosers">
                {choosers.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
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
            <label>종류</label>
            <select
              className="select"
              value={draft.tags[0] ?? ''}
              // 고른 값 하나만 담는다. 빈 값이면 태그 없이 저장한다.
              onChange={(e) => setDraft({ ...draft, tags: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">고르지 않음</option>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
