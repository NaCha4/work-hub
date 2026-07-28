export type Id = string

export interface Member {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  role: 'owner' | 'member' | 'viewer'
  joinedAt: number
}

/** 업무 일지 */
export interface Journal {
  id: Id
  /** YYYY-MM-DD. 일지는 하루 단위라 제목 없이 날짜로 구분한다. */
  date: string
  /** 오늘 한 일 (markdown) */
  done: string
  /** 내일 할 일 (markdown) */
  next: string
  /** 이슈 / 막힌 것 (markdown) */
  blockers: string
  tags: string[]
  authorUid: string
  authorName: string
  createdAt: number
  updatedAt: number
}

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/** 할 일 */
export interface Task {
  id: Id
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority
  /** YYYY-MM-DD, 없으면 빈 문자열 */
  due: string
  project: string
  tags: string[]
  /** 회의에서 파생된 액션 아이템이면 회의 id */
  meetingId?: Id
  assigneeUid: string
  assigneeName: string
  order: number
  createdAt: number
  updatedAt: number
}

/** 회의록 */
export interface Meeting {
  id: Id
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  time: string
  place: string
  attendees: string[]
  /** 안건 (markdown) */
  agenda: string
  /** 논의 내용 (markdown) */
  notes: string
  /** 결정 사항 (markdown) */
  decisions: string
  tags: string[]
  authorUid: string
  authorName: string
  createdAt: number
  updatedAt: number
}

/** 회의 준비자료 — 업로드한 단일 HTML 문서를 그대로 보여주고 공유한다 */
export interface Prep {
  id: Id
  title: string
  subtitle: string
  /** 발표/회의 예정일 YYYY-MM-DD */
  date: string
  /** 연결된 회의록 id */
  meetingId?: Id
  /**
   * 본문이 어디 있는지. 비어 있으면 이 문서 안(htmlz 또는 html)이다.
   * 'rtdb' 면 눌러도 Firestore 상한을 넘는 자료라 Realtime Database 에 원본으로 있다.
   * 준비자료는 `preps/{id}`, 발표본 사본은 `sessions/{code}/doc` 이다.
   */
  store?: '' | 'rtdb'
  /**
   * 업로드한 HTML 문서를 gzip 으로 눌러 base64 로 담은 것.
   * Firestore 문서 상한이 1 MiB 라 원문을 그대로 넣으면 얼마 못 담는다.
   */
  htmlz?: string
  /** 압축 전에 올린 자료. 새로 만들지는 않고 이미 쌓인 것을 읽기만 한다. */
  html: string
  /**
   * 예전 마크다운 본문. 새로 만들 수는 없고, 이미 쌓인 자료와 발행해둔 세션 링크가
   * 깨지지 않도록 읽기만 한다. theme 도 그때만 쓴다.
   */
  content?: string
  theme?: 'light' | 'dark' | 'slide'
  tags: string[]
  authorUid: string
  authorName: string
  createdAt: number
  updatedAt: number
}

/** buildPrepHtml 에 넘길 수 있는 최소 형태 — 준비자료 본체와 세션 스냅샷이 공유한다. */
export type PrepDoc = Pick<
  Prep,
  | 'title' | 'subtitle' | 'date'
  | 'store' | 'htmlz' | 'html' | 'content' | 'theme'
  | 'tags' | 'authorName'
>

/**
 * 발표 세션 — 로그인 없이 준비자료 하나를 보여주기 위한 공개 링크.
 * 문서 ID 가 곧 세션 코드이며, 그것이 유일한 인증 수단이다.
 */
export interface Session {
  id: Id
  prepId: Id
  /** 발행 시점의 준비자료 사본. 이후 원본을 고쳐도 발표본은 바뀌지 않는다. */
  snapshot: PrepDoc
  active: boolean
  /** ms epoch. 이 시각이 지나면 보안 규칙 단계에서 읽기가 막힌다. */
  expiresAt: number
  /** 코드 외에 추가로 걸어둘 안내 문구 (선택) */
  note: string
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: '대기',
  todo: '할 일',
  doing: '진행 중',
  review: '검토',
  done: '완료',
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
}
