import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

/** 마크다운 → 안전한 HTML. 사용자 입력이므로 항상 sanitize 한다. */
export function renderMarkdown(src: string): string {
  if (!src?.trim()) return ''
  return DOMPurify.sanitize(marked.parse(src, { async: false }) as string)
}

export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function nowTime(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → 'YYYY-MM-DD (월)'. 일지가 무슨 요일이었는지가 자주 필요하다. */
export function withDow(date: string): string {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  return `${date} (${DOW[new Date(y, m - 1, d).getDay()]})`
}

export function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function parseTags(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
}
