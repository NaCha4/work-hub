import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type QueryConstraint,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'

export type CollectionName =
  | 'journals'
  | 'tasks'
  | 'meetings'
  | 'preps'
  | 'meals'
  | 'members'
  | 'sessions'
  | 'schedules'
  | 'scheduleProjects'

/** 컬렉션 실시간 구독. 로그인 전에는 enabled=false 로 두어 규칙 위반 호출을 막는다. */
export function useCollection<T extends { id: string }>(
  name: CollectionName,
  enabled: boolean,
  ...constraints: QueryConstraint[]
) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(constraints.map((c) => c.type))

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, name), ...constraints),
      (snap) => {
        setItems(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })))
        setLoading(false)
        setError(null)
      },
      (e) => {
        setError(e.message)
        setLoading(false)
      },
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, key])

  return { items, loading, error }
}

export const byUpdated = orderBy('updatedAt', 'desc')
export const byDate = orderBy('date', 'desc')

export async function createDoc<T extends object>(
  name: CollectionName,
  data: T,
) {
  const now = Date.now()
  const ref = await addDoc(collection(db, name), {
    ...data,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function updateDocById(
  name: CollectionName,
  id: string,
  patch: Record<string, unknown>,
) {
  await updateDoc(doc(db, name, id), { ...patch, updatedAt: Date.now() })
}

export async function deleteDocById(name: CollectionName, id: string) {
  await deleteDoc(doc(db, name, id))
}
