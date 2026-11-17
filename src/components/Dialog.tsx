import { useEffect, useRef, type ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  title: ReactNode
  children: ReactNode
  actions: ReactNode
  /** Leaving without doing anything (Escape). */
  onClose?: () => void
}

export function Dialog({ open, title, children, actions, onClose }: DialogProps) {
  const box = useRef<HTMLDivElement>(null)

  // Escape closes — before anything behind the dialog hears the key
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // the keyboard is in the dialog from the start, not behind it
  useEffect(() => {
    if (open && !box.current?.contains(document.activeElement)) box.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
