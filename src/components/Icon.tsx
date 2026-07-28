import type { ReactNode } from 'react'

/**
 * 인라인 SVG 아이콘. 이모지를 쓰지 않고, 아이콘 라이브러리도 들이지 않는다.
 * 모두 currentColor 를 따르므로 부모의 색과 테마를 그대로 물려받는다.
 */
export type IconName =
  | 'dashboard'
  | 'journal'
  | 'tasks'
  | 'meetings'
  | 'preps'
  | 'settings'
  | 'moon'
  | 'sun'
  | 'calendar'
  | 'key'
  | 'search'
  | 'meals'
  | 'brand'

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <path d="M3 3h8v8H3z" />
      <path d="M13 3h8v5h-8z" />
      <path d="M13 10h8v11h-8z" />
      <path d="M3 13h8v8H3z" />
    </>
  ),
  journal: (
    <>
      <path d="M6 3h13v18H6z" />
      <path d="M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2" />
      <path d="M10 8h5M10 12h5" />
    </>
  ),
  tasks: (
    <>
      <path d="M4 7l1.5 1.5L8 6" />
      <path d="M4 16l1.5 1.5L8 15" />
      <path d="M11 7.5h9M11 16.5h9" />
    </>
  ),
  meetings: (
    <>
      <path d="M4 4h16v12H10l-6 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  preps: (
    <>
      <path d="M3 4h18v12H3z" />
      <path d="M12 16v4M8 20h8" />
      <path d="M8 12V9M12 12V7M16 12V10" />
    </>
  ),
  settings: (
    <>
      <path d="M3 8h9M17 8h4" />
      <circle cx="14.5" cy="8" r="2.5" />
      <path d="M3 16h5M13 16h8" />
      <circle cx="10.5" cy="16" r="2.5" />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  calendar: (
    <>
      <path d="M4 6h16v15H4z" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="16.5" r="4" />
      <path d="M10.5 13.5L20 4M17 7l3 3M14.5 9.5l2.5 2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  // 포크와 나이프
  meals: (
    <>
      <path d="M7 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3" />
      <path d="M9 12v9M9 3v5" />
      <path d="M17 3c-1.5 1.5-2 3-2 5s.5 3 2 3v10" />
    </>
  ),
  brand: (
    <>
      <path d="M3 4h7v7H3z" />
      <path d="M14 4h7v7h-7z" />
      <path d="M3 15h7v6H3z" />
      <path d="M14 15h7v6h-7z" />
    </>
  ),
}

interface Props {
  name: IconName
  size?: number
  className?: string
}

export default function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
