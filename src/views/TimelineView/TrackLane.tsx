import { useRef, type PointerEvent } from 'react'

import { PlusIcon, TrashIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { actionEnd, clampActionMove, clampActionResize, snapTime } from '@/lib/timeline'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { TimelineAction, Track } from '@/types/project'
import { EASE_LABEL, type TimelineRow } from './timelineRows'

export const HEADER_W = 200
/** Snap distance, in screen pixels. */
const SNAP_PX = 8
const GRID_S = 0.1

function currentTrack(trackId: string): Track | undefined {
  const s = useStore.getState()
  return selectCurrentProject(s)?.stages[s.aid ?? '']?.tracks.find((t) => t.id === trackId)
}

/** Left column of a track row: what it animates, plus add / remove. */
export function TrackHeader({ row, active }: { row: TimelineRow; active: boolean }) {
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const selectAction = useStore((s) => s.selectAction)
  const addActionAt = useStore((s) => s.addActionAt)
  const removeTrack = useStore((s) => s.removeTrack)
  const initSelected = useStore(
    (s) => s.selection?.trackId === row.track.id && s.selection.actionId === 'init',
  )

  const select = () => {
    // the camera track selects the camera object in the world
    selectWorldObject(row.key ?? ANIM_CAMERA_KEY)
    if (!row.key) selectAction({ trackId: row.track.id, actionId: 'init' })
  }

  return (
    <div
      className="tl-head"
      style={{
        width: HEADER_W,
        paddingLeft: 8 + row.depth * 14,
        color: active ? 'var(--color-accent-100)' : undefined,
      }}
      onClick={select}
      title={row.label}
    >
      <span
        style={{
          flex: 'none',
          minWidth: 26,
          padding: '1px 3px',
          borderRadius: 2,
          background: 'var(--color-neutral-800)',
          color: 'var(--color-accent-300)',
          fontSize: 8,
          fontFamily: 'ui-monospace, monospace',
          textAlign: 'center',
        }}
      >
        {row.tag}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {row.label}
      </span>
      <IconButton
        title="Initial pose"
        onClick={(e) => {
          e.stopPropagation()
          selectAction({ trackId: row.track.id, actionId: 'init' })
        }}
      >
        <span className={'tl-init' + (initSelected ? ' tl-init--selected' : '')} />
      </IconButton>
      <IconButton
        title="Add an action at the playhead"
        onClick={(e) => {
          e.stopPropagation()
          addActionAt(row.track.id, useStore.getState().playT)
        }}
      >
        <PlusIcon size={12} />
      </IconButton>
      <IconButton
        title="Remove track"
        onClick={(e) => {
          e.stopPropagation()
          removeTrack(row.track.id)
        }}
      >
        <TrashIcon size={11} />
      </IconButton>
    </div>
  )
}

type DragMode = 'move' | 'start' | 'end'

function ActionBlock({
  track,
  action,
  px,
  selected,
}: {
  track: Track
  action: TimelineAction
  px: number
  selected: boolean
}) {
  const selectAction = useStore((s) => s.selectAction)
  const beginEdit = useStore((s) => s.beginEdit)
  const updateAction = useStore((s) => s.updateAction)
  const drag = useRef<{
    mode: DragMode
    x0: number
    start0: number
    end0: number
    began: boolean
    targets: number[]
  } | null>(null)

  const onDown = (e: PointerEvent<HTMLDivElement>, mode: DragMode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectAction({ trackId: track.id, actionId: action.id })
    // snap targets: every other action edge on any track, and the playhead
    const s = useStore.getState()
    const tracks = selectCurrentProject(s)?.stages[s.aid ?? '']?.tracks ?? []
    const targets = [s.playT]
    for (const t of tracks)
      for (const a of t.actions) if (a.id !== action.id) targets.push(a.start, actionEnd(a))
    drag.current = {
      mode,
      x0: e.clientX,
      start0: action.start,
      end0: actionEnd(action),
      began: false,
      targets,
    }
    e.currentTarget.closest<HTMLElement>('.tl-block')?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x0
    if (!d.began) {
      if (Math.abs(dx) < 3) return
      beginEdit() // the whole drag is one undo step
      d.began = true
    }
    const tr = currentTrack(track.id)
    if (!tr) return
    const snapOn = useStore.getState().snap
    const opts = snapOn ? { targets: d.targets, threshold: SNAP_PX / px, grid: GRID_S } : {}
    const dt = dx / px

    if (d.mode === 'move') {
      const len = d.end0 - d.start0
      const raw = d.start0 + dt
      let start = raw
      if (snapOn) {
        // snap whichever edge lands closer to a target, else the grid
        const byStart = snapTime(raw, { targets: d.targets, threshold: SNAP_PX / px })
        const byEnd = snapTime(raw + len, { targets: d.targets, threshold: SNAP_PX / px }) - len
        const sDist = byStart !== raw ? Math.abs(byStart - raw) : Infinity
        const eDist = byEnd !== raw ? Math.abs(byEnd - raw) : Infinity
        start =
          sDist <= eDist && sDist < Infinity
            ? byStart
            : eDist < Infinity
              ? byEnd
              : snapTime(raw, { grid: GRID_S })
      }
      updateAction(track.id, action.id, { start: clampActionMove(tr, action.id, start) })
    } else {
      const edgeT = snapTime((d.mode === 'start' ? d.start0 : d.end0) + dt, opts)
      updateAction(track.id, action.id, clampActionResize(tr, action.id, d.mode, edgeT))
    }
  }

  const onUp = () => {
    drag.current = null
  }

  const width = Math.max(6, action.duration * px)
  return (
    <div
      className={'tl-block' + (selected ? ' tl-block--selected' : '')}
      style={{ left: action.start * px, width }}
      title={`${action.start.toFixed(2)}s → ${actionEnd(action).toFixed(2)}s · ${EASE_LABEL[action.ease]}${action.toLinked ? ' · to connector' : ''}`}
      onPointerDown={(e) => onDown(e, 'move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {width > 44 && <span>{action.duration.toFixed(1)}s</span>}
      {width > 110 && <span style={{ opacity: 0.6 }}>{EASE_LABEL[action.ease]}</span>}
      {width > 150 && action.toLinked && <span style={{ opacity: 0.8 }}>→ connector</span>}
      {width > 16 && (
        <>
          <div
            className="tl-handle"
            style={{ left: 0 }}
            onPointerDown={(e) => onDown(e, 'start')}
          />
          <div className="tl-handle" style={{ right: 0 }} onPointerDown={(e) => onDown(e, 'end')} />
        </>
      )}
    </div>
  )
}

/** One track's lane: its action blocks and the initial-pose marker.
 *  Double-click empty space to create an action there. */
export function TrackLane({ track, width }: { track: Track; width: number }) {
  const px = useStore((s) => s.pxPerSecond)
  const selection = useStore((s) => s.selection)
  const selectAction = useStore((s) => s.selectAction)
  const addActionAt = useStore((s) => s.addActionAt)

  const timeAt = (clientX: number, el: HTMLElement) => {
    const t = (clientX - el.getBoundingClientRect().left) / px
    return useStore.getState().snap ? snapTime(t, { grid: GRID_S }) : t
  }

  return (
    <div
      className="tl-lane"
      style={{ width }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) selectAction(null)
      }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) addActionAt(track.id, timeAt(e.clientX, e.currentTarget))
      }}
    >
      {track.actions.map((a) => (
        <ActionBlock
          key={a.id}
          track={track}
          action={a}
          px={px}
          selected={selection?.actionId === a.id}
        />
      ))}
    </div>
  )
}
