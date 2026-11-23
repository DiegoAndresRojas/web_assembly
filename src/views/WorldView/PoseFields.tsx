import { useEffect, useState, type KeyboardEvent } from 'react'

import type { WorldSession } from '@/lib/three/worldSession'
import type { Axis, Pose } from '@/types/project'

const AXES: Axis[] = ['x', 'y', 'z']

/** Arrow-key steps: [plain, with Shift]. */
const STEPS = { pos: [0.1, 1], rot: [1, 15] } as const

const shown = (n: number, field: 'pos' | 'rot') =>
  String(Number(n.toFixed(field === 'pos' ? 3 : 1)))

/** X / Y / Z of the selected object, sliding out beside the gizmo's Move or
 *  Rotate button: what the viewport shows, live while the gizmo drags it,
 *  and typed values put it there as a drag would. Enter or leaving the
 *  field applies, Esc drops the edit, ↑/↓ nudge (Shift: more). */
export function PoseFields({
  session,
  id,
  mode,
}: {
  session: WorldSession | null
  id: string
  mode: 'translate' | 'rotate'
}) {
  const field = mode === 'translate' ? 'pos' : 'rot'
  const [pose, setPose] = useState<Pose | null>(null)
  const [draft, setDraft] = useState<Partial<Record<Axis, string>>>({})

  // follow the live object (gizmo drags, undo, playback) frame by frame,
  // re-rendering only when what is shown changes
  useEffect(() => {
    if (!session) return
    let raf = 0
    let last = ''
    const tick = () => {
      const p = session.getObjectPose(id)
      const key = p ? AXES.map((a) => shown(p.pos[a], 'pos') + shown(p.rot[a], 'rot')).join() : ''
      if (key !== last) {
        last = key
        setPose(p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [session, id])

  if (!pose || !session) return null

  const put = (axis: Axis, value: number) => {
    const next: Pose = { pos: { ...pose.pos }, rot: { ...pose.rot } }
    next[field][axis] = value
    session.setObjectPose(id, next)
  }
  const forget = (axis: Axis) =>
    setDraft((d) => {
      const rest = { ...d }
      delete rest[axis]
      return rest
    })
  const commit = (axis: Axis) => {
    const text = draft[axis]
    forget(axis)
    const n = text === undefined ? NaN : Number(text.replace(',', '.'))
    if (Number.isFinite(n) && shown(n, field) !== shown(pose[field][axis], field)) put(axis, n)
  }
  const onKey = (axis: Axis, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      forget(axis)
      // (blur after the draft is gone, so nothing is applied)
      requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = STEPS[field][e.shiftKey ? 1 : 0] * (e.key === 'ArrowUp' ? 1 : -1)
      forget(axis)
      put(axis, Number((pose[field][axis] + step).toFixed(4)))
    }
  }

  return (
    <div className="pose-fields" key={mode}>
      {AXES.map((axis) => (
        <label key={axis} className={`pose-field pose-field--${axis}`}>
          <span>{axis.toUpperCase()}</span>
          <input
            inputMode="decimal"
            aria-label={`${mode === 'translate' ? 'Position' : 'Rotation'} ${axis.toUpperCase()}`}
            value={draft[axis] ?? shown(pose[field][axis], field)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft((d) => ({ ...d, [axis]: e.target.value }))}
            onBlur={() => commit(axis)}
            onKeyDown={(e) => onKey(axis, e)}
          />
          {field === 'rot' && <i>°</i>}
        </label>
      ))}
    </div>
  )
}
