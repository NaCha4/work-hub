import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { generateCode, normalizeCode } from './session'
import type {
  ProjectCalendar,
  Schedule,
  ScheduleShare,
  SharedProject,
  SharedSchedule,
  Task,
} from './types'

export function scheduleShareUrl(code: string): string {
  return `${location.origin}${location.pathname}#/p/${normalizeCode(code)}`
}

/**
 * 발행 시점의 프로젝트·일정 스냅샷을 만든다.
 * 공개 링크로 나가는 자료라 개인 일정(프로젝트 없는 일정)과 장소, 프로젝트 메모는 담지 않는다.
 * 일정·마일스톤 메모는 공유 화면에서 보여주기 위해 담는다.
 */
export function buildShareSnapshot(
  calendarNames: string[],
  projectMap: Map<string, ProjectCalendar>,
  schedules: Schedule[],
  taskMap: Map<string, Task>,
): { projects: SharedProject[]; schedules: SharedSchedule[] } {
  const projects = calendarNames.map((name) => {
    const item = projectMap.get(name)
    return {
      name,
      color: item?.color ?? 'blue',
      status: item?.status ?? 'active',
      due: item?.due ?? '',
      milestones: item?.milestones ?? [],
    } satisfies SharedProject
  })
  const names = new Set(calendarNames)
  const shared = schedules
    .map((item) => ({ item, project: item.project || taskMap.get(item.taskId)?.project || '' }))
    .filter(({ project }) => names.has(project))
    .map(({ item, project }) => ({
      title: item.title,
      kind: item.kind,
      project,
      startDate: item.startDate,
      endDate: item.endDate,
      startTime: item.startTime,
      endTime: item.endTime,
      allDay: item.allDay,
      notes: item.notes,
    } satisfies SharedSchedule))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime))
  return { projects, schedules: shared }
}

/** 공유 문서를 만들거나(코드 새로 발급) 기존 코드에 스냅샷만 갈아끼운다. */
export async function publishScheduleShare(
  existing: ScheduleShare | undefined,
  snapshot: { projects: SharedProject[]; schedules: SharedSchedule[] },
  author: { uid: string; name: string },
): Promise<string> {
  const now = Date.now()
  if (existing) {
    await updateDoc(doc(db, 'scheduleShares', existing.id), {
      ...snapshot,
      active: true,
      publishedAt: now,
      updatedAt: now,
    })
    return existing.id
  }
  const code = generateCode()
  await setDoc(doc(db, 'scheduleShares', code), {
    ...snapshot,
    active: true,
    publishedAt: now,
    createdBy: author.uid,
    createdByName: author.name,
    createdAt: now,
    updatedAt: now,
  })
  return code
}

/**
 * 코드로 공유 문서 하나를 읽는다. 비로그인 상태에서도 호출된다.
 * 발표 세션과 마찬가지로, 없는 코드든 닫힌 코드든 permission-denied 로 돌아오므로
 * 전부 '열 수 없음'으로만 답해 존재 여부를 흘리지 않는다.
 */
export async function fetchScheduleShare(input: string): Promise<ScheduleShare | null> {
  const code = normalizeCode(input)
  if (!code) return null
  try {
    const snap = await getDoc(doc(db, 'scheduleShares', code))
    if (!snap.exists()) return null
    const share = { ...(snap.data() as ScheduleShare), id: snap.id }
    return share.active ? share : null
  } catch {
    return null
  }
}
