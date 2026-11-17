import type { PointerEvent } from 'react'

import { PlayIcon, TrashIcon } from '@/components/icons'
import { NameField } from '@/components/NameField'
import type { Corner } from '@/lib/frames'
import type { BoardFrame } from '@/types/project'

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export interface FrameBoxProps {
  frame: BoardFrame
  /** How many animations stand inside it. */
  count: number
  selected: boolean
  /** A press on its top strip: selects it, and starts dragging it. */
  onGrab: (e: PointerEvent) => void
  onResizeStart: (corner: Corner, e: PointerEvent) => void
  onPlay: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

/** A presentation on the board: a rectangle around the animations it
 *  plays. Only its top strip and corners take the pointer — the board and
 *  the nodes inside it are reached through the rest. */
export function FrameBox({
  frame,
  count,
  selected,
  onGrab,
  onResizeStart,
  onPlay,
  onRename,
  onDelete,
}: FrameBoxProps) {
  return (
    <div
      className={'board-frame' + (selected ? ' board-frame--on' : '')}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
    >
      <div className="board-frame-head" onPointerDown={onGrab}>
        <button
          className="board-frame-play"
          title={
            count
              ? 'Play this presentation'
              : 'Nothing to play yet: drag an animation into the frame'
          }
          aria-label={`Play ${frame.label}`}
          disabled={!count}
          onPointerDown={stop}
          onClick={onPlay}
        >
          <PlayIcon size={13} />
        </button>
        {/* (its own pointer events: a press on the name is not a drag) */}
        <span onPointerDown={selected ? stop : undefined} style={{ minWidth: 0, flex: '0 1 auto' }}>
          {selected ? (
            <NameField
              label="Presentation name"
              value={frame.label}
              onRename={onRename}
              style={{ width: 150, fontSize: 12 }}
            />
          ) : (
            <span className="board-frame-name">{frame.label}</span>
          )}
        </span>
        <span className="text-muted" style={{ flex: 'none', fontSize: 11 }}>
          {count === 0 ? 'empty' : count === 1 ? '1 animation' : `${count} animations`}
        </span>
        <span style={{ flex: 1 }} />
        {selected && (
          <button
            className="tool-btn tool-btn--danger"
            title="Delete this frame (the animations stay)"
            aria-label="Delete frame"
            onPointerDown={stop}
            onClick={onDelete}
          >
            <TrashIcon size={14} />
          </button>
        )}
      </div>
      {count === 0 && (
        <div className="board-frame-hint">Drag animations in here. They play left to right.</div>
      )}
      {selected &&
        CORNERS.map((corner) => (
          <div
            key={corner}
            className={`board-frame-corner board-frame-corner--${corner}`}
            onPointerDown={(e) => onResizeStart(corner, e)}
          />
        ))}
    </div>
  )
}
