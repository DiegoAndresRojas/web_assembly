import { useState, type CSSProperties } from 'react'

export interface NameFieldProps {
  value: string
  /** Called with the trimmed name once editing ends — never with an empty one. */
  onRename: (name: string) => void
  /** What the field names, for assistive tech and the tooltip ("Camera name"). */
  label: string
  style?: CSSProperties
}

/** A name that is edited in place: looks like plain text until focused.
 *  Enter or leaving the field commits, Escape puts the old name back, and
 *  an empty name is never kept. */
export function NameField({ value, onRename, label, style }: NameFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const name = draft?.trim()
    if (name && name !== value) onRename(name)
    setDraft(null)
  }

  return (
    <input
      className="name-field"
      aria-label={label}
      title={`${label} — click to rename`}
      value={draft ?? value}
      spellCheck={false}
      onFocus={(e) => {
        setDraft(value)
        e.target.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // the field owns its keys: nothing behind it should react to them
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(null)
          // (blur commits the draft — which is now gone, so nothing changes)
          const el = e.currentTarget
          queueMicrotask(() => el.blur())
        }
      }}
      style={style}
    />
  )
}
