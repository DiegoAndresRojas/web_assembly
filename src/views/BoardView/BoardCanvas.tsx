import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'

import { FRAME_MIN_H, FRAME_MIN_W } from '@/lib/constants'
import {
  frameAnimations,
  frameAround,
  hasOwnOrder,
  framedPlaces,
  rectFrom,
  resizeRect,
  type Corner,
  type Rect,
} from '@/lib/frames'
import { stageName } from '@/lib/cameras'
import { useStore } from '@/store'
import type { NodeKind, Project } from '@/types/project'
import { BoardNode } from './BoardNode'
import { EdgeLayer } from './EdgeLayer'
import { FrameBox } from './FrameBox'
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
  /** Whether the node has left where the drag found it. */
  moved: boolean
}

/** A frame being dragged by its top strip, or resized by a corner. */
interface FrameDrag {
  frameId: string
  corner: Corner | null
  start: Rect
  px: number
  py: number
  moved: boolean
}

export function BoardCanvas({ project }: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)
  const dragRef = useRef<DragAnchor | null>(null)
  const frameDragRef = useRef<FrameDrag | null>(null)
  /** A frame being drawn with the frame tool: where it started, and the
   *  rectangle so far. */
  const drawRef = useRef<{ x: number; y: number } | null>(null)
  const [drawing, setDrawing] = useState<Rect | null>(null)

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
  const renameNode = useStore((s) => s.renameNode)
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
  const pushBoardHistory = useStore((s) => s.pushBoardHistory)
  const zoomAt = useStore((s) => s.zoomAt)
  const fitBoard = useStore((s) => s.fitBoard)
  const importMeshFiles = useStore((s) => s.importMeshFiles)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const selFrame = useStore((s) => s.selFrame)
  const addFrame = useStore((s) => s.addFrame)
  const selectFrame = useStore((s) => s.selectFrame)
  const moveFrame = useStore((s) => s.moveFrame)
  const resizeFrame = useStore((s) => s.resizeFrame)
  const renameFrame = useStore((s) => s.renameFrame)
  const deleteFrame = useStore((s) => s.deleteFrame)
  const moveFrameScene = useStore((s) => s.moveFrameScene)
  const resetFrameOrder = useStore((s) => s.resetFrameOrder)
  const openViewer = useStore((s) => s.openViewer)

  // which animations stand in a frame, and in what order they play
  const places = useMemo(() => framedPlaces(project), [project])

  const fit = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) fitBoard(rect.width, rect.height)
  }, [fitBoard])

  // a board that was just opened shows all of itself (coming back from a
  // stage, it is found as it was left)
  useEffect(() => {
    if (useStore.getState().boardFit) fit()
  }, [project.id, fit])

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
    if (effectiveTool() === 'frame') {
      const p = pointFromEvent(e.clientX, e.clientY)
      drawRef.current = p
      setDrawing({ x: p.x, y: p.y, w: 0, h: 0 })
    }
  }
  const handleBoardMove = (e: ReactPointerEvent) => {
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan(panStartRef.current.pan.x + dx, panStartRef.current.pan.y + dy)
      return
    }
    if (drawRef.current) {
      const p = pointFromEvent(e.clientX, e.clientY)
      setDrawing(rectFrom(drawRef.current.x, drawRef.current.y, p.x, p.y))
      return
    }
    if (frameDragRef.current) {
      const drag = frameDragRef.current
      const p = pointFromEvent(e.clientX, e.clientY)
      const dx = p.x - drag.px
      const dy = p.y - drag.py
      if (!drag.moved && Math.hypot(dx, dy) < 2) return
      // (one thing to undo, like a node's drag)
      if (!drag.moved) pushBoardHistory()
      drag.moved = true
      if (drag.corner) resizeFrame(drag.frameId, resizeRect(drag.start, drag.corner, dx, dy))
      else moveFrame(drag.frameId, drag.start.x + dx, drag.start.y + dy)
      return
    }
    if (dragRef.current) {
      const p = pointFromEvent(e.clientX, e.clientY)
      // the whole drag is one thing to undo: where the node was before it
      if (!dragRef.current.moved) pushBoardHistory()
      dragRef.current.moved = true
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
    frameDragRef.current = null
    if (drawRef.current) {
      const p = pointFromEvent(e.clientX, e.clientY)
      const rect = rectFrom(drawRef.current.x, drawRef.current.y, p.x, p.y)
      drawRef.current = null
      setDrawing(null)
      // a click (or a rectangle too small to be one) gives the usual size
      addFrame(rect.w < FRAME_MIN_W / 2 || rect.h < FRAME_MIN_H / 2 ? frameAround(p.x, p.y) : rect)
      setTool('select')
      return
    }
    if (linking) {
      const p = pointFromEvent(e.clientX, e.clientY)
      completeLinking(p.x, p.y)
    }
  }
  const handleWheel = (e: ReactWheelEvent) => {
    // toward the pointer: what is under it stays under it
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(e.deltaY < 0 ? 0.15 : -0.15, e.clientX - rect.left, e.clientY - rect.top)
  }
  const handleDragOver = (e: DragEvent) => e.preventDefault()
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    const p = pointFromEvent(e.clientX, e.clientY)
    // files from the computer: into the library, and onto the board here
    const files = Array.from(e.dataTransfer.files)
    if (files.length) {
      void importMeshFiles(project.id, files).then((ids) =>
        ids.forEach((id, i) => dropMeshOnBoard(id, p.x + i * 28, p.y + i * 28)),
      )
      return
    }
    const meshId = e.dataTransfer.getData('text/ms-mesh-id')
    const kind = e.dataTransfer.getData('text/ms-node-kind') as NodeKind | 'frame' | ''
    if (meshId) dropMeshOnBoard(meshId, p.x, p.y)
    else if (kind === 'frame') addFrame(frameAround(p.x, p.y))
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
        cursor: tool === 'frame' ? 'crosshair' : undefined,
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
        {project.board.frames.map((frame) => (
          <FrameBox
            key={frame.id}
            frame={frame}
            scenes={frameAnimations(project, frame).map((n) => ({ id: n.id, name: stageName(n) }))}
            ownOrder={hasOwnOrder(project, frame)}
            onMoveScene={(stageId, by) => moveFrameScene(frame.id, stageId, by)}
            onBoardOrder={() => resetFrameOrder(frame.id)}
            selected={selFrame === frame.id}
            onGrab={(e) => {
              e.stopPropagation()
              selectFrame(frame.id)
              if (effectiveTool() === 'pan') return
              const p = pointFromEvent(e.clientX, e.clientY)
              frameDragRef.current = {
                frameId: frame.id,
                corner: null,
                start: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
                px: p.x,
                py: p.y,
                moved: false,
              }
            }}
            onResizeStart={(corner, e) => {
              e.stopPropagation()
              const p = pointFromEvent(e.clientX, e.clientY)
              frameDragRef.current = {
                frameId: frame.id,
                corner,
                start: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
                px: p.x,
                py: p.y,
                moved: false,
              }
            }}
            onPlay={() => openViewer(project.id, 'board', frame.id)}
            onRename={(name) => renameFrame(frame.id, name)}
            onDelete={() => deleteFrame(frame.id)}
          />
        ))}
        {drawing && (
          <div
            className="board-frame board-frame--drawing"
            style={{ left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }}
          />
        )}
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
            framed={places.get(node.id) ?? null}
            onPointerDown={(e) => {
              e.stopPropagation()
              selectNode(node.id)
              if (effectiveTool() === 'select') {
                const p = pointFromEvent(e.clientX, e.clientY)
                dragRef.current = {
                  nodeId: node.id,
                  x0: node.x,
                  y0: node.y,
                  px: p.x,
                  py: p.y,
                  moved: false,
                }
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
            onRename={(name) => renameNode(node.id, name)}
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
      <BoardZoomControls onFit={fit} />
      {project.board.nodes.length + project.board.frames.length === 0 && (
        <div
          className="text-muted"
          style={{
            position: 'absolute',
            left: 'var(--space-8)',
            top: 'var(--space-8)',
            fontSize: 13,
            maxWidth: '44ch',
            lineHeight: 1.5,
            pointerEvents: 'none',
          }}
        >
          Drag a part from the library and an assembly (the round token below it) onto the board,
          then drop the part on the assembly to put it in. Double-click an assembly to open it.
        </div>
      )}
      {/* swallow a stray link-drag that never lands on a valid target */}
      {linking && <div style={{ position: 'absolute', inset: 0 }} onPointerLeave={cancelLinking} />}
    </main>
  )
}
