import type { PointerEvent } from 'react'

import { FilmIcon, LinkHandleIcon, PlusIcon } from '@/components/icons'
import { MESH_H, MESH_W, NODE_W } from '@/lib/constants'
import type { BoardNode as BoardNodeData, MeshRecord } from '@/types/project'

const STAGE_COLOR: Record<string, string> = {
  assembly: 'var(--color-accent)',
  animation: 'var(--color-neutral-300)',
}

export interface BoardNodeProps {
  node: BoardNodeData
  mesh: MeshRecord | null
  selected: boolean
  hovered: boolean
  onPointerDown: (e: PointerEvent) => void
  onPointerUp: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onDoubleClick: () => void
  onDelete: (e: PointerEvent) => void
  onDuplicate: (e: PointerEvent) => void
  onColor: (e: PointerEvent) => void
  onScale: (e: PointerEvent) => void
  onLinkStart: (e: PointerEvent) => void
}

export function BoardNode({
  node,
  mesh,
  selected,
  hovered,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
  onDoubleClick,
  onDelete,
  onDuplicate,
  onColor,
  onScale,
  onLinkStart,
}: BoardNodeProps) {
  const isMesh = node.kind === 'mesh'
  const w = isMesh ? MESH_W : NODE_W
  const h = isMesh ? MESH_H : NODE_W
  const showHandles = isMesh && (hovered || selected)
  const showOut = !isMesh && (hovered || selected)
  const color = STAGE_COLOR[node.kind] ?? STAGE_COLOR.assembly

  return (
    <div
      data-node="board"
      style={{
        position: 'absolute',
        left: node.x - w / 2,
        top: node.y - h / 2,
        width: w,
        height: h,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '4px var(--space-2)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-md)',
            whiteSpace: 'nowrap',
          }}
        >
          {isMesh && (
            <>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onPointerDown={onColor}>
                Color
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onPointerDown={onScale}>
                Scale
              </button>
            </>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onPointerDown={onDuplicate}>
            Duplicate
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onPointerDown={onDelete}>
            Delete
          </button>
        </div>
      )}

      {isMesh ? (
        <>
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {node.color && (
              <div
                title={`Color ${node.color}`}
                style={{ height: 4, flex: 'none', background: node.color }}
              />
            )}
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                backgroundImage:
                  'repeating-linear-gradient(135deg, var(--color-neutral-900), var(--color-neutral-900) 5px, transparent 5px, transparent 10px)',
              }}
            >
              <span
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                  color: 'var(--color-neutral-400)',
                }}
              >
                {mesh?.ext.toUpperCase() ?? ''}
              </span>
              {node.scale !== 1 && (
                <span
                  title={`Scaled ×${node.scale}`}
                  style={{
                    position: 'absolute',
                    top: node.color ? 10 : 6,
                    right: 6,
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-accent-800)',
                    color: 'var(--color-accent-100)',
                    fontSize: 10,
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  ×{node.scale}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                fontSize: 11,
                borderTop: '1px solid var(--color-divider)',
              }}
            >
              {node.color && (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    flex: 'none',
                    borderRadius: '50%',
                    background: node.color,
                    boxShadow: '0 0 0 1px var(--color-divider)',
                  }}
                />
              )}
              <span
                style={{
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {mesh?.name ?? ''}
              </span>
            </div>
          </div>
          {showHandles && (
            <>
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <div
                  key={side}
                  onPointerDown={onLinkStart}
                  style={{
                    position: 'absolute',
                    ...(side === 'top' ? { left: '50%', top: -12, marginLeft: -10 } : {}),
                    ...(side === 'bottom' ? { left: '50%', bottom: -12, marginLeft: -10 } : {}),
                    ...(side === 'left' ? { top: '50%', left: -12, marginTop: -10 } : {}),
                    ...(side === 'right' ? { top: '50%', right: -12, marginTop: -10 } : {}),
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--color-accent-700)',
                    color: 'var(--color-accent-100)',
                    fontSize: 9,
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'crosshair',
                  }}
                >
                  <LinkHandleIcon side={side} size={13} />
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              cursor: 'pointer',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-sm)',
              border: `1px solid ${color}`,
              color,
            }}
          >
            {node.kind === 'animation' ? (
              <FilmIcon size={25} />
            ) : (
              <PlusIcon size={26} />
            )}
          </div>
          {showOut && (
            <div
              onPointerDown={onLinkStart}
              title="Output"
              style={{
                position: 'absolute',
                top: '50%',
                right: -14,
                marginTop: -11,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'crosshair',
              }}
            >
              <LinkHandleIcon side="right" size={13} />
            </div>
          )}
          <div
            className="text-muted"
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: 4,
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {node.label}
          </div>
        </>
      )}
    </div>
  )
}
