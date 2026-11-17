import type { PointerEvent } from 'react'

import { ChevronRightIcon, PlayIcon, TrashIcon } from '@/components/icons'
import { NameField } from '@/components/NameField'
import type { Corner } from '@/lib/frames'
import type { BoardFrame } from '@/types/project'

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export interface FrameBoxProps {
  frame: BoardFrame
  /** The animations standing inside it, in the order they play. */
  scenes: Array<{ id: string; name: string }>
  /** The order is one the author set, not the board's. */
  ownOrder: boolean
  selected: boolean
  /** A press on its top strip: selects it, and starts dragging it. */
  onGrab: (e: PointerEvent) => void
  onResizeStart: (corner: Corner, e: PointerEvent) => void
  onPlay: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onMoveScene: (stageId: string, by: number) => void
  onBoardOrder: () => void
}

/** A presentation on the board: a rectangle around the animations it
 *  plays. Only its top strip and corners take the pointer — the board and
 *  the nodes inside it are reached through the rest. */
export function FrameBox({
  frame,
  scenes,
  ownOrder,
  selected,
  onGrab,
  onResizeStart,
  onPlay,
  onRename,
  onDelete,
  onMoveScene,
  onBoardOrder,
}: FrameBoxProps) {
  const count = scenes.length
  return (
    <div
      className={'board-frame' + (selected ? ' board-frame--on' : '')}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
    >
      {selected && count > 1 && (
        // the order it plays in, to change: above the frame, clear of
        // what stands in it
        <div className="board-frame-order" onPointerDown={stop}>
          <span className="text-muted">Plays</span>
          {scenes.map((scene, i) => (
            <span key={scene.id} className="board-frame-chip">
              <button
                title="Play it earlier"
                aria-label={`Play ${scene.name} earlier`}
                disabled={i === 0}
                onClick={() => onMoveScene(scene.id, -1)}
              >
                <ChevronRightIcon size={9} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="board-frame-chip-name" title={scene.name}>
                {i + 1}. {scene.name}
              </span>
              <button
                title="Play it later"
                aria-label={`Play ${scene.name} later`}
                disabled={i === count - 1}
                onClick={() => onMoveScene(scene.id, 1)}
              >
                <ChevronRightIcon size={9} />
              </button>
            </span>
          ))}
          {ownOrder && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11 }}
              title="Play them as they stand on the board again: left to right"
              onClick={onBoardOrder}
            >
              Board order
            </button>
          )}
        </div>
      )}
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
          {ownOrder ? ' · own order' : ''}
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
        <div className="board-frame-hint">
          Drag animations in here. They play left to right, unless you set another order.
        </div>
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
