import {
  useCallback,
  useRef,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'

import { useStore } from '@/store'
import type { NodeKind, Project } from '@/types/project'
import { BoardNode } from './BoardNode'
import { EdgeLayer } from './EdgeLayer'
import { BoardToolSwitcher, BoardZoomControls } from './Toolbar'

export interface BoardCanvasProps {
  project: Project
}

interface DragAnchor {
  nodeId: string
  x0: number
  y0: number
  px: number
  py: number
}

export function BoardCanvas({ project }: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)
  const dragRef = useRef<DragAnchor | null>(null)

  const pan = useStore((s) => s.pan)
  const zoom = useStore((s) => s.zoom)
  const hover = useStore((s) => s.hover)
  const selId = useStore((s) => s.selId)
  const effectiveTool = useStore((s) => s.effectiveTool)
  const setPan = useStore((s) => s.setPan)
  const moveNode = useStore((s) => s.moveNode)
  const linkIfDropped = useStore((s) => s.linkIfDropped)
  const selectNode = useStore((s) => s.selectNode)
  const hoverNode = useStore((s) => s.hoverNode)
  const deleteNode = useStore((s) => s.deleteNode)
  const duplicateNode = useStore((s) => s.duplicateNode)
  const zoomBy = useStore((s) => s.zoomBy)
  const startLinking = useStore((s) => s.startLinking)
  const updateLinking = useStore((s) => s.updateLinking)
  const completeLinking = useStore((s) => s.completeLinking)
  const cancelLinking = useStore((s) => s.cancelLinking)
  const linking = useStore((s) => s.linking)
  const dropMeshOnBoard = useStore((s) => s.dropMeshOnBoard)
  const openScaleEditor = useStore((s) => s.openScaleEditor)
  const dropStageOnBoard = useStore((s) => s.dropStageOnBoard)
  const openColorEditor = useStore((s) => s.openColorEditor)
  const openStage = useStore((s) => s.openStage)

  const pointFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom }
    },
    [pan, zoom],
  )

  const handleBoardDown = (e: ReactPointerEvent) => {
    if (effectiveTool() === 'pan') {
      panStartRef.current = { x: e.clientX, y: e.clientY, pan: { ...pan } }
      return
    }
    selectNode(null)
  }
  const handleBoardMove = (e: ReactPointerEvent) => {
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan(panStartRef.current.pan.x + dx, panStartRef.current.pan.y + dy)
      return
    }
    if (dragRef.current) {
      const p = pointFromEvent(e.clientX, e.clientY)
      moveNode(
        dragRef.current.nodeId,
        dragRef.current.x0 + (p.x - dragRef.current.px),
        dragRef.current.y0 + (p.y - dragRef.current.py),
      )
      return
    }
    if (linking) {
      const p = pointFromEvent(e.clientX, e.clientY)
      updateLinking(p.x, p.y)
    }
  }
  const handleBoardUp = (e: ReactPointerEvent) => {
    panStartRef.current = null
    dragRef.current = null
    if (linking) {
      const p = pointFromEvent(e.clientX, e.clientY)
      completeLinking(p.x, p.y)
    }
  }
  const handleWheel = (e: ReactWheelEvent) => {
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 0.15 : -0.15)
  }
  const handleDragOver = (e: DragEvent) => e.preventDefault()
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    const p = pointFromEvent(e.clientX, e.clientY)
    const meshId = e.dataTransfer.getData('text/ms-mesh-id')
    const kind = e.dataTransfer.getData('text/ms-node-kind') as NodeKind | ''
    if (meshId) dropMeshOnBoard(meshId, p.x, p.y)
    else if (kind && kind !== 'mesh') dropStageOnBoard(kind, p.x, p.y)
  }

  return (
    <main
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg)',
        backgroundImage: 'radial-gradient(var(--color-neutral-800) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
      onPointerDown={handleBoardDown}
      onPointerMove={handleBoardMove}
      onPointerUp={handleBoardUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <EdgeLayer project={project} />
        {project.board.nodes.map((node) => (
          <BoardNode
            key={node.id}
            node={node}
            mesh={
              node.kind === 'mesh'
                ? (project.meshes.find((m) => m.id === node.meshId) ?? null)
                : null
            }
            selected={selId === node.id}
            hovered={hover === node.id}
            onPointerDown={(e) => {
              e.stopPropagation()
              selectNode(node.id)
              if (effectiveTool() === 'select') {
                const p = pointFromEvent(e.clientX, e.clientY)
                dragRef.current = { nodeId: node.id, x0: node.x, y0: node.y, px: p.x, py: p.y }
              }
            }}
            onPointerUp={() => {
              // only a real drag-and-drop links; a click never does
              const d = dragRef.current
              if (d && Math.hypot(node.x - d.x0, node.y - d.y0) > 2) linkIfDropped(d.nodeId)
              dragRef.current = null
            }}
            onPointerEnter={() => hoverNode(node.id)}
            onPointerLeave={() => hoverNode(null)}
            onDoubleClick={() => {
              if (node.kind !== 'mesh') openStage(node.id)
            }}
            onDelete={(e) => {
              e.stopPropagation()
              deleteNode(node.id)
            }}
            onDuplicate={(e) => {
              e.stopPropagation()
              duplicateNode(node.id)
            }}
            onColor={(e) => {
              e.stopPropagation()
              openColorEditor(node.id)
            }}
            onScale={(e) => {
              e.stopPropagation()
              void openScaleEditor(node.id)
            }}
            onLinkStart={(e) => {
              e.stopPropagation()
              const p = pointFromEvent(e.clientX, e.clientY)
              startLinking(node.id, p.x, p.y)
            }}
          />
        ))}
      </div>

      <BoardToolSwitcher />
      <BoardZoomControls />
      {project.board.nodes.length === 0 && (
        <div
          className="text-muted"
          style={{
            position: 'absolute',
            left: 'var(--space-8)',
            top: 'var(--space-8)',
            fontSize: 13,
            maxWidth: '34ch',
            pointerEvents: 'none',
          }}
        >
          Drag a mesh tile and an assembly stage here, then connect them.
        </div>
      )}
      {/* swallow a stray link-drag that never lands on a valid target */}
      {linking && <div style={{ position: 'absolute', inset: 0 }} onPointerLeave={cancelLinking} />}
    </main>
  )
}
