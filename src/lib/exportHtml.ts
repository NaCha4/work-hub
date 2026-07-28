import { renderMarkdown } from './markdown'
import type { Prep, PrepDoc } from './types'

type Theme = NonNullable<Prep['theme']>

const THEMES: Record<Theme, { bg: string; fg: string; accent: string; card: string; muted: string }> = {
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
function buildPrepHtml(prep: PrepDoc): string {
  const t = THEMES[prep.theme ?? 'light'] ?? THEMES.light
  const body = renderMarkdown(prep.content ?? '')
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

/**
 * 업로드한 HTML 을 눌러 담기 위한 짝.
 *
 * Firestore 문서 상한 1 MiB 는 하드 리밋이라 늘릴 수 없다. 대신 HTML 은 같은
 * 태그와 글자가 반복돼 잘 눌리므로, gzip 으로 줄이면 실질 한도가 몇 배가 된다.
 * base64 로 되돌리는 값이 원래보다 1/3 늘지만 압축분이 훨씬 크다.
 *
 * 브라우저 기본 기능(CompressionStream)이라 의존성은 그대로 여섯 개다.
 */
const CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  // 한 번에 다 넘기면 인자가 너무 많아 스택이 넘친다. 나눠서 이어붙인다.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const compressionSupported =
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

export async function packHtml(html: string): Promise<string> {
  const stream = new Blob([html]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return bytesToBase64(new Uint8Array(buf))
}

export async function unpackHtml(packed: string): Promise<string> {
  const bytes = base64ToBytes(packed)
  const stream = new Blob([bytes.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/**
 * 화면과 파일에 쓸 최종 HTML. 업로드한 문서가 있으면 손대지 않고 그대로 쓴다.
 * 없으면 예전 마크다운 자료라 문서로 만들어 준다.
 *
 * 눌러 담은 자료를 푸는 일이 있어 비동기다. 예전 자료도 같은 길로 지나간다.
 */
export async function resolvePrepHtml(prep: PrepDoc): Promise<string> {
  if (prep.htmlz) return unpackHtml(prep.htmlz)
  if (prep.html?.trim()) return prep.html
  return buildPrepHtml(prep)
}

/**
 * iframe 안의 문서를 어디까지 허용할지.
 *
 * 업로드한 HTML 은 우리가 쓴 코드가 아니다. 스크립트는 돌게 하되
 * **`allow-same-origin` 은 절대 함께 주지 않는다.** 둘을 같이 주는 순간 문서가
 * 이 앱의 출처를 얻어 로그인 토큰과 Firestore 에 손을 댈 수 있게 되고,
 * 격리가 통째로 사라진다. AGENTS.md 4.1 참고.
 */
export const PREP_SANDBOX = 'allow-scripts allow-modals allow-popups'

/**
 * 자료를 펼칠 논리 폭(px).
 *
 * 모두가 같은 폭에서 배치를 계산해야 덧칠 좌표가 어긋나지 않는다. 창 크기에
 * 맞춰 폭을 흘리면 반응형 자료가 다시 접히면서 같은 좌표가 다른 문단을 가리킨다.
 * 그래서 폭은 이 값으로 고정하고, 화면에 맞추는 일은 배율이 맡는다.
 */
export const STAGE_WIDTH = 1200

/**
 * 부모와 iframe 을 잇는 다리.
 *
 * 출처가 갈려 있어 부모가 iframe 안을 직접 만지지 못한다. 그래서 필요한 것만
 * postMessage 로 주고받는다. 지금 다루는 것은 둘이다.
 *   - 인쇄: 부모가 시키면 iframe 이 자기 print() 를 부른다.
 *   - 내용 높이: 부모가 iframe 을 그 높이만큼 늘려 **안쪽 스크롤을 없앤다.**
 *     그래야 덧칠 층이 iframe 과 같은 좌표계 위에 얹혀 함께 움직인다.
 *     스크롤은 둘을 감싼 바깥이 맡는다.
 *
 * 문서 뒤에 덧붙이기만 하고, 내려받는 파일에는 넣지 않아 원본을 그대로 남긴다.
 */
export function withViewerBridge(html: string): string {
  return `${html}
<style>html,body{overflow:visible!important}</style>
<script>(function(){
  function report(){
    parent.postMessage({ t: 'wh:size', h: document.documentElement.scrollHeight }, '*')
  }
  addEventListener('message', function(e){ if (e.data === 'wh:print') print() })
  addEventListener('load', report)
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement)
  report()
})()</script>`
}

export async function downloadHtml(prep: PrepDoc) {
  const blob = new Blob([await resolvePrepHtml(prep)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeTitle = (prep.title || 'prep').replace(/[\\/:*?"<>|]/g, '_')
  a.href = url
  a.download = `${prep.date || 'doc'}_${safeTitle}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 새 탭 미리보기는 없앴다. window.open + document.write 로 띄우면 그 문서가
// 이 앱과 같은 출처에서 실행된다. 업로드한 HTML 은 스크립트를 담을 수 있으므로
// 반드시 sandbox 를 건 iframe 안에서만 연다.
