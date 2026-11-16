import { useRef, useState } from 'react'

import { useStore } from '@/store'
import type { Axis, Pose } from '@/types/project'

const AXIS_COLOR: Record<Axis, string> = { x: '#e06a6a', y: '#7ac08f', z: '#6a8fe0' }

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

/** A compact number input for live edits: keeps what's being typed ("1.",
 *  "-") as text while focused, and opens one undo step (beginEdit) on the
 *  first change of each focus — not one per keystroke. */
export function NumberField({
  value,
  onChange,
  step = 0.1,
  disabled = false,
  label,
  labelColor,
  width = 64,
  undoable = true,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  disabled?: boolean
  label?: string
  labelColor?: string
  width?: number
  /** Opens an undo step on edit (off for non-document values like the playhead). */
  undoable?: boolean
}) {
  const beginEdit = useStore((s) => s.beginEdit)
  const [draft, setDraft] = useState<string | null>(null)
  const opened = useRef(false)

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: 'ui-monospace, monospace',
        color: labelColor ?? 'var(--color-neutral-400)',
      }}
    >
      {label && <span style={{ minWidth: 10, textAlign: 'right' }}>{label}</span>}
      <input
        className="input num-input"
        type="number"
        step={step}
        disabled={disabled}
        value={draft ?? fmt(value)}
        style={{ width }}
        onFocus={() => {
          opened.current = false
          setDraft(fmt(value))
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseFloat(e.target.value)
          if (!Number.isFinite(n)) return
          if (undoable && !opened.current) {
            beginEdit()
            opened.current = true
          }
          onChange(n)
        }}
      />
    </label>
  )
}

/** Position + rotation fields for one pose. */
export function PoseFields({
  pose,
  onChange,
  disabled = false,
}: {
  pose: Pose
  onChange: (pose: Pose) => void
  disabled?: boolean
}) {
  const set = (kind: 'pos' | 'rot', axis: Axis, v: number) =>
    onChange({ ...pose, [kind]: { ...pose[kind], [axis]: v } })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(['pos', 'rot'] as const).map((kind) => (
        <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 22, fontSize: 9, color: 'var(--color-neutral-500)' }}>
            {kind === 'pos' ? 'POS' : 'ROT°'}
          </span>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <NumberField
              key={axis}
              label={axis.toUpperCase()}
              labelColor={AXIS_COLOR[axis]}
              value={pose[kind][axis]}
              step={kind === 'pos' ? 0.1 : 5}
              width={58}
              disabled={disabled}
              onChange={(v) => set(kind, axis, v)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
