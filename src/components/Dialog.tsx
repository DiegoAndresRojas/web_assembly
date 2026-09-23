import type { ReactNode } from 'react'

export interface DialogProps {
  open: boolean
  title: ReactNode
  children: ReactNode
  actions: ReactNode
}

export function Dialog({ open, title, children, actions }: DialogProps) {
  if (!open) return null
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
