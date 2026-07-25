import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
  closeLabel?: string
  children: ReactNode
  extraActions?: ReactNode
}

export default function Modal({
  title,
  onClose,
  onSubmit,
  submitLabel = '저장',
  closeLabel,
  children,
  extraActions,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onSubmit])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className="modal-foot">
          {extraActions}
          <button className="btn ghost" onClick={onClose}>
            {closeLabel ?? (onSubmit ? '취소' : '닫기')}
          </button>
          {onSubmit && (
            <button className="btn primary" onClick={onSubmit}>
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
