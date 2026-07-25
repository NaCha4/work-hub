import { useState } from 'react'
import { renderMarkdown } from '../lib/markdown'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

/** 마크다운 입력 + 미리보기 토글. */
export default function MarkdownField({ label, value, onChange, placeholder, rows = 6 }: Props) {
  const [preview, setPreview] = useState(false)

  return (
    <div className="field">
      <label style={{ display: 'flex', alignItems: 'center' }}>
        {label}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? '편집' : '미리보기'}
        </button>
      </label>
      {preview ? (
        <div
          className="md card"
          style={{ minHeight: rows * 24, boxShadow: 'none' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="muted">내용 없음</p>' }}
        />
      ) : (
        <textarea
          className="textarea"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
