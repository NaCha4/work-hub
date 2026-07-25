import { renderMarkdown } from './markdown'
import type { Prep, PrepDoc } from './types'

const THEMES: Record<Prep['theme'], { bg: string; fg: string; accent: string; card: string; muted: string }> = {
  light: { bg: '#f7f7f5', fg: '#1c1c1a', accent: '#c96442', card: '#ffffff', muted: '#6b6b66' },
  dark: { bg: '#141413', fg: '#f0eee6', accent: '#e08a6b', card: '#1f1f1d', muted: '#a3a39c' },
  slide: { bg: '#0e1116', fg: '#e9edf2', accent: '#5aa9e6', card: '#161b22', muted: '#9aa4b0' },
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * 준비자료를 외부 의존성이 전혀 없는 단일 HTML 문서로 만든다.
 * 파일 하나만 전달하면 동료가 브라우저로 바로 열어볼 수 있다.
 */
export function buildPrepHtml(prep: PrepDoc): string {
  const t = THEMES[prep.theme] ?? THEMES.light
  const body = renderMarkdown(prep.content)
  const meta = [prep.date, prep.authorName].filter(Boolean).join(' · ')
  const tags = prep.tags.map((x) => `<span class="tag">#${esc(x)}</span>`).join('')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(prep.title || '회의 준비자료')}</title>
<style>
  :root { color-scheme: ${prep.theme === 'light' ? 'light' : 'dark'}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 20px 96px;
    background: ${t.bg}; color: ${t.fg};
    font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo",
      "Malgun Gothic", "Segoe UI", sans-serif;
    line-height: 1.75; font-size: 16px;
  }
  main { max-width: 820px; margin: 0 auto; }
  header { border-bottom: 2px solid ${t.accent}; padding-bottom: 20px; margin-bottom: 36px; }
  h1 { font-size: 2rem; margin: 0 0 8px; letter-spacing: -0.02em; }
  .sub { color: ${t.muted}; margin: 0 0 12px; font-size: 1.05rem; }
  .meta { color: ${t.muted}; font-size: 0.875rem; }
  .tag { display: inline-block; background: ${t.card}; border: 1px solid ${t.muted}55;
    color: ${t.muted}; border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; margin: 6px 6px 0 0; }
  h2 { font-size: 1.4rem; margin: 2.2em 0 0.6em; padding-left: 12px; border-left: 4px solid ${t.accent}; }
  h3 { font-size: 1.12rem; margin: 1.8em 0 0.5em; color: ${t.accent}; }
  p, li { word-break: keep-all; overflow-wrap: anywhere; }
  ul, ol { padding-left: 1.4em; }
  li { margin: 0.3em 0; }
  a { color: ${t.accent}; }
  code { background: ${t.card}; border: 1px solid ${t.muted}33; border-radius: 4px;
    padding: 1px 5px; font-size: 0.9em; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
  pre { background: ${t.card}; border: 1px solid ${t.muted}33; border-radius: 10px;
    padding: 16px; overflow-x: auto; }
  pre code { background: none; border: 0; padding: 0; }
  blockquote { margin: 1.2em 0; padding: 8px 18px; border-left: 4px solid ${t.muted}66;
    background: ${t.card}; color: ${t.muted}; border-radius: 0 8px 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.2em 0; display: block; overflow-x: auto; }
  th, td { border: 1px solid ${t.muted}44; padding: 8px 12px; text-align: left; }
  th { background: ${t.card}; }
  hr { border: 0; border-top: 1px solid ${t.muted}44; margin: 2.5em 0; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  footer { max-width: 820px; margin: 64px auto 0; padding-top: 16px;
    border-top: 1px solid ${t.muted}33; color: ${t.muted}; font-size: 0.8rem; }
  @media print {
    body { background: #fff; color: #000; padding: 0; }
    h2 { break-after: avoid; } pre, blockquote, table { break-inside: avoid; }
  }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(prep.title || '회의 준비자료')}</h1>
    ${prep.subtitle ? `<p class="sub">${esc(prep.subtitle)}</p>` : ''}
    <div class="meta">${esc(meta)}</div>
    ${tags ? `<div>${tags}</div>` : ''}
  </header>
  ${body}
</main>
<footer>Work Hub 에서 내보냄</footer>
</body>
</html>`
}

export function downloadHtml(prep: PrepDoc) {
  const blob = new Blob([buildPrepHtml(prep)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeTitle = (prep.title || 'prep').replace(/[\\/:*?"<>|]/g, '_')
  a.href = url
  a.download = `${prep.date || 'doc'}_${safeTitle}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openPreview(prep: PrepDoc) {
  const w = window.open('', '_blank')
  if (!w) {
    alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.')
    return
  }
  w.document.write(buildPrepHtml(prep))
  w.document.close()
}
