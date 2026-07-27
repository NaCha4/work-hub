import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import { useAuth } from '../lib/auth'
import { byDate, byUpdated, useCollection } from '../lib/db'
import { withDow } from '../lib/markdown'
import type { Journal, Meeting, Prep } from '../lib/types'

interface Hit {
  key: string
  kind: '일지' | '메모' | '자료'
  title: string
  snippet: string
  go: () => void
}

/** 검색어 앞뒤 한 토막만 남긴다. 본문 전체를 보여주면 목록이 아니라 벽이 된다. */
function snip(text: string, k: string): string {
  const flat = text.replace(/\s+/g, ' ')
  const i = flat.toLowerCase().indexOf(k)
  if (i < 0) return ''
  const from = Math.max(0, i - 30)
  const to = Math.min(flat.length, i + k.length + 50)
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`
}

/** 업로드한 HTML 에서 사람이 읽는 글자만 남긴다. 태그와 스크립트는 검색 대상이 아니다. */
function textOf(p: Prep): string {
  const src = p.html || p.content || ''
  return src
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

/**
 * 일지·회의 메모·준비자료를 한 창에서 찾는다.
 *
 * 화면마다 있는 검색은 그 화면 것만 본다. "어디에 적었는지" 부터 모를 때 쓰라고
 * 있는 창이므로, 결과를 누르면 그 화면으로 옮겨 해당 항목을 열거나 검색어를 건다.
 */
export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { member } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { items: journals } = useCollection<Journal>('journals', !!member, byDate)
  const { items: meetings } = useCollection<Meeting>('meetings', !!member, byDate)
  const { items: preps } = useCollection<Prep>('preps', !!member, byUpdated)

  // 자료 하나가 수백 KB 일 수 있어 타이핑마다 벗기지 않고 한 번 벗겨 둔다.
  const prepTexts = useMemo(() => new Map(preps.map((p) => [p.id, textOf(p)])), [preps])

  const hits = useMemo<Hit[]>(() => {
    const k = q.trim().toLowerCase()
    if (k.length < 2) return []
    const go = (to: string, state: object) => () => {
      onClose()
      nav(to, { state })
    }

    const out: Hit[] = []
    for (const j of journals) {
      const text = [j.date, j.done, j.next, j.blockers, j.tags.join(' ')].join('\n')
      if (!text.toLowerCase().includes(k)) continue
      out.push({
        key: `j${j.id}`,
        kind: '일지',
        title: withDow(j.date),
        snippet: snip(text, k),
        go: go('/journal', { q }),
      })
    }
    for (const m of meetings) {
      const text = [m.title, m.date, m.place, m.notes, m.attendees.join(' ')].join('\n')
      if (!text.toLowerCase().includes(k)) continue
      out.push({
        key: `m${m.id}`,
        kind: '메모',
        title: `${m.title} · ${m.date}`,
        snippet: snip(text, k),
        go: go('/meetings', { q, open: m.id }),
      })
    }
    for (const p of preps) {
      const text = [p.title, p.subtitle, p.date, p.tags.join(' '), prepTexts.get(p.id) ?? ''].join('\n')
      if (!text.toLowerCase().includes(k)) continue
      out.push({
        key: `p${p.id}`,
        kind: '자료',
        title: `${p.title || '(제목 없음)'} · ${p.date}`,
        snippet: snip(text, k),
        go: go('/preps', { open: p.id }),
      })
    }
    return out.slice(0, 20)
  }, [q, journals, meetings, preps, prepTexts, nav, onClose])

  return (
    <Modal title="검색" onClose={onClose}>
      <input
        className="input"
        autoFocus
        placeholder="일지 · 회의 메모 · 준비자료에서 찾기 (2자 이상)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') hits[0]?.go()
        }}
      />
      <div className="search-hits">
        {q.trim().length >= 2 && hits.length === 0 && (
          <p className="muted" style={{ margin: '12px 0 0' }}>결과가 없습니다.</p>
        )}
        {hits.map((h) => (
          <button key={h.key} className="search-hit" onClick={h.go}>
            <span className="kind">{h.kind}</span>
            <span className="body">
              <span className="t">{h.title}</span>
              {h.snippet && <span className="s">{h.snippet}</span>}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
