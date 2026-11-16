import { useState, type ReactNode } from 'react'

import { ChevronRightIcon } from './icons'

const STORAGE_KEY = 'meshstudio.folds'

function readFolds(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Whether a panel section is unfolded — remembered across visits and
 *  reloads (a preference of the person, not part of any project). */
export function useFold(id: string, initially = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => readFolds()[id] ?? initially)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readFolds(), [id]: next }))
    } catch {
      // no storage: the fold simply isn't remembered
    }
  }
  return [open, toggle]
}

export interface FoldHeaderProps {
  title: string
  /** Shown next to the title: a count, or what is chosen while folded. */
  note?: ReactNode
  open: boolean
  onToggle: () => void
  /** Buttons at the right end of the header. */
  children?: ReactNode
}

/** The header of a section that folds away to give its room to the rest. */
export function FoldHeader({ title, note, open, onToggle, children }: FoldHeaderProps) {
  return (
    <div className="fold-head">
      <button className="fold-toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronRightIcon
          size={9}
          style={{ flex: 'none', transform: open ? 'rotate(90deg)' : undefined }}
        />
        <span className="tl-section-title">{title}</span>
        {note !== undefined && note !== '' && <span className="fold-note">{note}</span>}
      </button>
      {children}
    </div>
  )
}
