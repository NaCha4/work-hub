import { useMemo, useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../lib/auth'
import { deleteDocById, updateDocById, useCollection } from '../lib/db'
import {
  EXPIRY_OPTIONS,
  createSession,
  generateCode,
  sessionUrl,
} from '../lib/session'
import { dropLive, syncMeta } from '../lib/live'
import type { Prep, PrepDoc, Session } from '../lib/types'

/**
 * 발표본에 담을 사본. 발행과 갱신이 같은 모양을 써야 한다.
 * Firestore 는 undefined 를 받지 않으므로 예전 마크다운 자료일 때만 그 두 칸을 넣는다.
 */
function snapshotOf(prep: Prep): PrepDoc {
  return {
    title: prep.title,
    subtitle: prep.subtitle,
    date: prep.date,
    htmlz: prep.htmlz ?? '',
    html: prep.html ?? '',
    tags: prep.tags,
    authorName: prep.authorName,
    ...(prep.content ? { content: prep.content, theme: prep.theme ?? 'light' } : {}),
  }
}

/** 준비자료 하나에 대한 발표 세션(공개 링크) 발행·관리 창. */
export default function SessionManager({
  prep,
  onClose,
}: {
  prep: Prep
  onClose: () => void
}) {
  const { member } = useAuth()
  const { items, error } = useCollection<Session>('sessions', !!member)
  const [expiryIdx, setExpiryIdx] = useState(1)
  const [note, setNote] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const mine = useMemo(
    () =>
      items
        .filter((s) => s.prepId === prep.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    [items, prep.id],
  )

  async function publish() {
    if (!prep.id) {
      alert('먼저 준비자료를 저장해 주세요.')
      return
    }
    setBusy(true)
    try {
      const code = generateCode()
      const expiresAt = Date.now() + EXPIRY_OPTIONS[expiryIdx].ms
      await createSession(code, {
        prepId: prep.id,
        snapshot: snapshotOf(prep),
        active: true,
        expiresAt,
        note: note.trim(),
        createdBy: member!.uid,
        createdByName: member!.displayName,
      })
      // 덧칠 통로의 규칙이 이 값을 보고 판단한다. 없으면 발표자도 그리지 못한다.
      await syncMeta(code, { ownerUid: member!.uid, active: true, expiresAt })
      setIssued(code)
      setNote('')
    } catch (e) {
      alert(`세션을 만들지 못했습니다: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, kind: string) {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1600)
  }

  /** 현재 준비자료 내용으로 발표본을 다시 찍어낸다. 코드와 링크는 그대로 유지된다. */
  async function refresh(s: Session) {
    if (!confirm('지금 준비자료 내용으로 이 세션의 자료를 갱신할까요?')) return
    await updateDocById('sessions', s.id, { snapshot: snapshotOf(prep) })
  }

  /** 열고 닫기. RTDB 쪽 상태도 함께 맞춰야 이미 보고 있는 사람의 덧칠 통로가 닫힌다. */
  async function toggle(s: Session) {
    const active = !s.active
    await updateDocById('sessions', s.id, { active })
    await syncMeta(s.id, { ownerUid: s.createdBy, active, expiresAt: s.expiresAt })
  }

  async function remove(s: Session) {
    if (!confirm(`코드 ${s.id} 를 삭제할까요? 링크가 즉시 막힙니다.`)) return
    await deleteDocById('sessions', s.id)
    await dropLive(s.id)
  }

  return (
    <Modal title="발표 세션 공유" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        코드를 받은 사람은 로그인 없이 이 자료만 볼 수 있습니다.
        Work Hub 의 다른 내용은 보이지 않습니다.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {issued && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>새 세션 코드</div>
          <div className="code-display">{issued}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn sm" onClick={() => copy(issued, 'code')}>
              {copied === 'code' ? '복사됨' : '코드 복사'}
            </button>
            <button className="btn sm" onClick={() => copy(sessionUrl(issued), 'link')}>
              {copied === 'link' ? '복사됨' : '링크 복사'}
            </button>
            <a className="btn sm" href={`#/s/${issued}`} target="_blank" rel="noreferrer">
              발표 시작
            </a>
          </div>
        </div>
      )}

      <div className="row">
        <div className="field">
          <label>유효 기간</label>
          <select
            className="select"
            value={expiryIdx}
            onChange={(e) => setExpiryIdx(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>안내 문구 (선택)</label>
          <input
            className="input"
            value={note}
            placeholder="예) 7/28 주간회의 공유본"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <button className="btn primary" onClick={publish} disabled={busy}>
        {busy ? '만드는 중…' : '+ 새 코드 발급'}
      </button>

      {mine.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, marginTop: 24, marginBottom: 8 }}>
            발급된 코드 ({mine.length})
          </h3>
          {mine.map((s) => {
            const expired = s.expiresAt < Date.now()
            return (
              <div key={s.id} className="session-row">
                <code className="session-code">{s.id}</code>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{s.note || '—'}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {expired
                      ? '만료됨'
                      : `${new Date(s.expiresAt).toLocaleDateString('ko-KR')} 까지`}
                    {!s.active && ' · 닫힘'}
                  </div>
                </div>
                {/* 발표자도 시청자와 같은 링크를 쓴다. 만든 사람으로 알아보고
                    덧칠 도구를 띄우므로 따로 발표자용 주소가 없다. */}
                {s.active && !expired && (
                  <a className="btn sm" href={`#/s/${s.id}`} target="_blank" rel="noreferrer">
                    발표 시작
                  </a>
                )}
                <button className="btn ghost sm" onClick={() => copy(sessionUrl(s.id), s.id)}>
                  {copied === s.id ? '복사됨' : '링크'}
                </button>
                <button className="btn ghost sm" onClick={() => refresh(s)}>갱신</button>
                <button className="btn ghost sm" onClick={() => toggle(s)}>
                  {s.active ? '닫기' : '열기'}
                </button>
                <button className="btn ghost sm danger" onClick={() => remove(s)}>삭제</button>
              </div>
            )
          })}
        </>
      )}
    </Modal>
  )
}
