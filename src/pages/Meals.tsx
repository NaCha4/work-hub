import { useMemo, useState } from 'react'
import BarChart, { type Bar } from '../components/BarChart'
import DateInput from '../components/DateInput'
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

export default function Meals() {
  const { member } = useAuth()
  const { items, loading, error } = useCollection<Meal>('meals', !!member, byDate)
  const [draft, setDraft] = useState<Meal | null>(null)
  const [span, setSpan] = useState<'week' | 'month'>('week')

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

  const dupeByDate = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of dupes) c.set(m.date, (c.get(m.date) ?? 0) + 1)
    return c
  }, [dupes])

  const stats = useMemo(() => {
    const since = span === 'week' ? daysAgo(6) : daysAgo(29)
    const inRange = unique.filter((m) => m.date >= since)

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
        .map(([label, value], i) => ({ key: label, label, value, color: KIND_COLORS[i % KIND_COLORS.length] }))
    }

    return {
      // 종류는 고른 값 하나만 쓰므로 첫 칸을 본다.
      byKind: rank((m) => m.tags[0] ?? '', 8),
      byPlace: rank((m) => m.place, 8).map((b) => ({ ...b, color: undefined })),
    }
  }, [unique, span])

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
        <div className="card">
          <div className="card-head">
            <h3>통계</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {span === 'week' ? '최근 7일' : '최근 30일'}
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
              <div className="pane-label">음식 종류</div>
              {stats.byKind.length > 0
                ? <BarChart bars={stats.byKind} unit="번" />
                : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>종류를 고른 기록이 없습니다.</p>}
            </div>
            <div>
              <div className="pane-label">자주 간 곳</div>
              {stats.byPlace.length > 0
                ? <BarChart bars={stats.byPlace} unit="번" />
                : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>장소를 적은 기록이 없습니다.</p>}
            </div>
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

