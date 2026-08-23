import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
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

/**
 * 프로젝트 캘린더를 지울 때 연결된 일정·업무는 보존하고 프로젝트 이름만 비운다.
 * Firestore 배치 상한보다 여유 있게 450개씩 나눠 처리하고 마지막 배치에서 설정을 지운다.
 */
export async function deleteProjectCalendar(
  projectId: string | undefined,
  scheduleIds: string[],
  taskIds: string[],
) {
  const refs = [
    ...scheduleIds.map((id) => doc(db, 'schedules', id)),
    ...taskIds.map((id) => doc(db, 'tasks', id)),
  ]
  if (!projectId && refs.length === 0) return
  const chunks = refs.length ? Math.ceil(refs.length / 450) : 1
  const now = Date.now()

  for (let index = 0; index < chunks; index += 1) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(index * 450, (index + 1) * 450)) {
      batch.update(ref, { project: '', updatedAt: now })
    }
    if (projectId && index === chunks - 1) batch.delete(doc(db, 'scheduleProjects', projectId))
    await batch.commit()
  }
}

/** 프로젝트에 연결된 일정을 전부 지운다. 프로젝트 캘린더 자체는 남긴다. */
export async function deleteProjectSchedules(scheduleIds: string[]) {
  for (let from = 0; from < scheduleIds.length; from += 450) {
    const batch = writeBatch(db)
    for (const id of scheduleIds.slice(from, from + 450)) {
      batch.delete(doc(db, 'schedules', id))
    }
    await batch.commit()
  }
}

/** 프로젝트 이름을 바꾸면서 연결된 일정과 업무의 문자열 참조도 함께 옮긴다. */
export async function renameProjectCalendar(
  projectId: string | undefined,
  scheduleIds: string[],
  taskIds: string[],
  name: string,
  fallback: { color: string; authorUid: string; authorName: string },
) {
  const refs = [
    ...scheduleIds.map((id) => doc(db, 'schedules', id)),
    ...taskIds.map((id) => doc(db, 'tasks', id)),
  ]
  const chunks = refs.length ? Math.ceil(refs.length / 450) : 1
  const now = Date.now()

  for (let index = 0; index < chunks; index += 1) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(index * 450, (index + 1) * 450)) {
      batch.update(ref, { project: name, updatedAt: now })
    }
    if (index === chunks - 1) {
      if (projectId) {
        batch.update(doc(db, 'scheduleProjects', projectId), { name, updatedAt: now })
      } else {
        batch.set(doc(collection(db, 'scheduleProjects')), {
          name,
          ...fallback,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    await batch.commit()
  }
}

/** 패널에서 정한 프로젝트 순서를 저장한다. 설정이 없던 기존 프로젝트도 이때 설정을 만든다. */
export async function saveProjectCalendarOrder(items: Array<{
  id?: string
  name: string
  color: string
  authorUid: string
  authorName: string
}>) {
  const now = Date.now()
  for (let from = 0; from < items.length; from += 450) {
    const batch = writeBatch(db)
    for (const [offset, item] of items.slice(from, from + 450).entries()) {
      const order = from + offset
      if (item.id) {
        batch.update(doc(db, 'scheduleProjects', item.id), { order, updatedAt: now })
      } else {
        batch.set(doc(collection(db, 'scheduleProjects')), {
          name: item.name,
          color: item.color,
          order,
          authorUid: item.authorUid,
          authorName: item.authorName,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    await batch.commit()
  }
}
