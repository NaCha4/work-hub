import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Session } from './types'

/**
 * 코드에 쓰는 글자. 0/O, 1/I/L, U 처럼 눈이나 귀로 헷갈리는 글자를 뺐다.
 * 발표 자리에서 코드를 불러줘야 할 수도 있어서다.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LEN = 4

/**
 * 30^4 = 810,000 가지. 불러주기 쉬운 길이를 택한 대신 무작위 대입 여지는 남는다.
 * 세션을 오래 열어두지 말고 발표가 끝나면 닫는 것으로 상쇄한다.
 */
export function generateCode(): string {
  const bytes = new Uint32Array(CODE_LEN)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** 사용자가 하이픈이나 공백을 섞어 입력해도 받아들인다. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isValidCodeShape(input: string): boolean {
  const c = normalizeCode(input)
  return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch))
}

export function sessionUrl(code: string): string {
  return `${location.origin}${location.pathname}#/s/${normalizeCode(code)}`
}

export type FetchResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not-found' | 'expired' | 'inactive' | 'error' }

/**
 * 코드로 세션 하나를 읽는다. 비로그인 상태에서도 호출된다.
 *
 * 비로그인 방문자에게는 보안 규칙이 1차 관문이다. 코드가 틀렸든, 문서가 없든,
 * 닫혔든, 만료됐든 전부 permission-denied 로 돌아온다 — 규칙이 resource.data 를
 * 평가할 수 없거나 조건이 거짓이기 때문이다. 그래서 그 경우를 실패가 아니라
 * '못 여는 코드'로 해석해야 한다. 어느 쪽인지 구분되지 않는 건 오히려 의도한 바로,
 * 무작위 대입으로 세션의 존재 여부를 알아낼 수 없다.
 *
 * 아래 inactive/expired 분기는 멤버가 자기 세션을 미리 열어볼 때만 도달한다.
 */
export async function fetchSession(input: string): Promise<FetchResult> {
  if (!isValidCodeShape(input)) return { ok: false, reason: 'not-found' }
  try {
    const snap = await getDoc(doc(db, 'sessions', normalizeCode(input)))
    if (!snap.exists()) return { ok: false, reason: 'not-found' }
    const session = { ...(snap.data() as Session), id: snap.id }
    if (!session.active) return { ok: false, reason: 'inactive' }
    if (session.expiresAt < Date.now()) return { ok: false, reason: 'expired' }
    return { ok: true, session }
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'permission-denied') return { ok: false, reason: 'not-found' }
    console.warn('session fetch failed', e)
    return { ok: false, reason: 'error' }
  }
}

/** 세션 문서는 ID 를 직접 정해야 하므로 addDoc 대신 setDoc 을 쓴다. */
export async function createSession(
  code: string,
  data: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const now = Date.now()
  await setDoc(doc(db, 'sessions', code), { ...data, createdAt: now, updatedAt: now })
}

export const EXPIRY_OPTIONS = [
  { label: '1일', ms: 24 * 60 * 60 * 1000 },
  { label: '7일', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30일', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '만료 없음', ms: 100 * 365 * 24 * 60 * 60 * 1000 },
]
