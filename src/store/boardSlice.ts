import {
  FRAME_MIN_H,
  FRAME_MIN_W,
  MESH_H,
  MESH_W,
  NODE_W,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '@/lib/constants'
import { duplicateNode } from '@/lib/duplicate'
import { addFrame, moveInFrame } from '@/lib/frames'
import { edgeFor } from '@/lib/graph'
import { normalizeStage } from '@/lib/migrations'
import type { Draft } from 'immer'

import { stageName } from '@/lib/cameras'
import { recoverFromChain } from '@/lib/chain'
import { recoverLightsFromChain } from '@/lib/lights'
import { reconcileProject } from '@/lib/stageInputs'
import { clamp, uid } from '@/lib/utils'
import { recordBoardEdit } from './boardHistorySlice'
import { ensureStage, findProject } from './helpers'
import type { BoardActions, BoardState, Get, Set } from './types'
import type { NodeKind, Project } from '@/types/project'

export const initialBoardState: BoardState = {
  pan: { x: 60, y: 60 },
  zoom: 1,
  tool:
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'pan' : 'select',
  ctrlDown: false,
  hover: null,
  selId: null,
  selEdge: null,
  selFrame: null,
  linking: null,
  meshFilterExt: null,
  boardFit: false,
  paletteHover: null,
}

/** An assembly was just wired into an animation: its pieces start where
 *  the animations earlier in the chain left them. Taken once, here — a
 *  piece the animation already holds a start pose for keeps it. */
function takeChainStartPoses(project: Draft<Project>, fromId: string, toId: string): void {
  const kindOf = (id: string) => project.board.nodes.find((n) => n.id === id)?.kind
  if (kindOf(fromId) !== 'assembly' || kindOf(toId) !== 'animation') return
  ensureStage(project, toId, 'animation')
  recoverFromChain(project, toId, fromId)
  // …and it is lit the way the animation before it was (unless it already
  // has lighting of its own)
  recoverLightsFromChain(project, toId)
}

function nodeBox(kind: NodeKind, x: number, y: number) {
  const w = kind === 'mesh' ? MESH_W : NODE_W
  const h = kind === 'mesh' ? MESH_H : NODE_W
  return { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 }
}

function pointInNode(kind: NodeKind, nx: number, ny: number, x: number, y: number): boolean {
  const b = nodeBox(kind, nx, ny)
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom
}

export function createBoardSlice(set: Set, get: Get): BoardActions {
  const actions: BoardActions = {
    effectiveTool() {
      const { tool, ctrlDown } = get()
      if (!ctrlDown) return tool
      return tool === 'pan' ? 'select' : 'pan'
    },
    setTool(mode) {
      set((state) => {
        state.tool = mode
      })
    },
    setCtrlDown(down) {
      set((state) => {
        state.ctrlDown = down
      })
    },

    zoomBy(delta) {
      set((state) => {
        state.zoom = clamp(state.zoom + delta, ZOOM_MIN, ZOOM_MAX)
      })
    },
    zoomIn() {
      get().zoomBy(ZOOM_STEP)
    },
    zoomOut() {
      get().zoomBy(-ZOOM_STEP)
    },
    resetView() {
      set((state) => {
        state.pan = { x: 60, y: 60 }
        state.zoom = 1
      })
    },
    zoomAt(delta, x, y) {
      set((state) => {
        const next = clamp(state.zoom + delta, ZOOM_MIN, ZOOM_MAX)
        const k = next / state.zoom
        state.pan = { x: x - (x - state.pan.x) * k, y: y - (y - state.pan.y) * k }
        state.zoom = next
      })
    },
    fitBoard(width, height) {
      set((state) => {
        state.boardFit = false
        const board = findProject(state, state.pid)?.board
        const nodes = board?.nodes ?? []
        const frames = board?.frames ?? []
        if (!(nodes.length + frames.length) || width <= 0 || height <= 0) {
          state.pan = { x: 60, y: 60 }
          state.zoom = 1
          return
        }
        const boxes = [
          ...nodes.map((n) => nodeBox(n.kind, n.x, n.y)),
          ...frames.map((f) => ({ left: f.x, top: f.y, right: f.x + f.w, bottom: f.y + f.h })),
        ]
        const left = Math.min(...boxes.map((b) => b.left))
        const right = Math.max(...boxes.map((b) => b.right))
        const top = Math.min(...boxes.map((b) => b.top))
        const bottom = Math.max(...boxes.map((b) => b.bottom))
        // room around for the toolbars and a node's own menu; never closer
        // than life size
        const margin = 90
        const zoom = clamp(
          Math.min(
            (width - 2 * margin) / Math.max(right - left, 1),
            (height - 2 * margin) / Math.max(bottom - top, 1),
          ),
          ZOOM_MIN,
          1,
        )
        state.zoom = zoom
        state.pan = {
          x: width / 2 - ((left + right) / 2) * zoom,
          y: height / 2 - ((top + bottom) / 2) * zoom,
        }
      })
    },
    setPan(x, y) {
      set((state) => {
        state.pan = { x, y }
      })
    },

    dropMeshOnBoard(meshId, x, y) {
      const id = uid()
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        project.board.nodes.push({
          id,
          kind: 'mesh',
          x,
          y,
          meshId,
          label: null,
          color: null,
          scale: 1,
        })
      })
      // a very small piece (e.g. modelled in meters) gets offered a scale-up
      // to whole units right away
      void get().openScaleEditor(id, true)
    },
    dropStageOnBoard(kind, x, y) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const count = project.board.nodes.filter((n) => n.kind === kind).length + 1
        const label = kind[0].toUpperCase() + kind.slice(1) + ' ' + count
        const id = uid()
        project.board.nodes.push({ id, kind, x, y, meshId: null, label, color: null, scale: 1 })
        // WorldView renders nothing for a stage that has no `stages[id]`
        // record yet — create it up front instead of waiting for openStage.
        project.stages[id] = normalizeStage({ kind })
      })
    },
    moveNode(nodeId, x, y) {
      set((state) => {
        const project = findProject(state, state.pid)
        const node = project?.board.nodes.find((n) => n.id === nodeId)
        if (node) {
          node.x = x
          node.y = y
        }
      })
    },
    linkIfDropped(nodeId) {
      // Dropping a dragged mesh node onto an assembly / animation node (the
      // intuitive gesture) links them — besides the link handle, which is
      // easy to miss since it only appears on hover. Deliberately narrow:
      // only a mesh being dragged (never a stage dragged over a mesh while
      // tidying the board).
      set((state) => {
        const project = findProject(state, state.pid)
        const dragged = project?.board.nodes.find((n) => n.id === nodeId)
        if (!project || !dragged || dragged.kind !== 'mesh') return
        const target = project.board.nodes.find(
          (n) =>
            n.id !== dragged.id &&
            (n.kind === 'assembly' || n.kind === 'animation') &&
            pointInNode(n.kind, n.x, n.y, dragged.x, dragged.y),
        )
        if (!target) return
        const exists = project.board.edges.some((e) => e.from === dragged.id && e.to === target.id)
        if (exists) return
        project.board.edges.push({ id: uid(), from: dragged.id, to: target.id })
        reconcileProject(project)
      })
    },
    selectNode(nodeId) {
      set((state) => {
        state.selId = nodeId
        state.selEdge = null
        state.selFrame = null
      })
    },
    hoverNode(nodeId) {
      set((state) => {
        state.hover = nodeId
      })
    },
    renameNode(nodeId, label) {
      set((state) => {
        const node = findProject(state, state.pid)?.board.nodes.find((n) => n.id === nodeId)
        if (node && node.kind !== 'mesh' && label.trim()) node.label = label.trim()
      })
    },
    duplicateNode(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const id = duplicateNode(project, nodeId)
        if (!id) return
        reconcileProject(project)
        state.selId = id
      })
    },
    deleteNode(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const node = project.board.nodes.find((n) => n.id === nodeId)
        if (!node) return
        project.board.nodes = project.board.nodes.filter((n) => n.id !== nodeId)
        project.board.edges = project.board.edges.filter(
          (e) => e.from !== nodeId && e.to !== nodeId,
        )
        if (node && node.kind !== 'mesh') delete project.stages[nodeId]
        // meshes and upstream assemblies are both stage inputs — whatever
        // any stage held about the deleted node goes with its edges
        reconcileProject(project)
        if (state.selId === nodeId) state.selId = null
      })
    },

    startLinking(nodeId, x, y) {
      set((state) => {
        state.linking = { from: nodeId, x, y }
      })
    },
    updateLinking(x, y) {
      set((state) => {
        if (state.linking) {
          state.linking.x = x
          state.linking.y = y
        }
      })
    },
    completeLinking(x, y) {
      const { linking, pid } = get()
      if (!linking) return
      set((state) => {
        const project = findProject(state, pid)
        const from = project?.board.nodes.find((n) => n.id === linking.from)
        if (!project || !from) {
          state.linking = null
          return
        }
        const target = project.board.nodes.find(
          (n) => n.id !== from.id && pointInNode(n.kind, n.x, n.y, x, y),
        )
        const edge = target ? edgeFor(project, from, target) : null
        if (edge) {
          const exists = project.board.edges.some((e) => e.from === edge.from && e.to === edge.to)
          if (!exists) {
            project.board.edges.push({ id: uid(), ...edge })
            reconcileProject(project)
            takeChainStartPoses(project, edge.from, edge.to)
          }
        }
        state.linking = null
      })
    },
    cancelLinking() {
      set((state) => {
        state.linking = null
      })
    },

    selectEdge(edgeId) {
      set((state) => {
        state.selEdge = edgeId
        state.selId = null
        state.selFrame = null
      })
    },
    removeEdge(edgeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (project) {
          project.board.edges = project.board.edges.filter((e) => e.id !== edgeId)
          reconcileProject(project)
        }
        if (state.selEdge === edgeId) state.selEdge = null
      })
    },
    deleteSelectedEdge() {
      const { selEdge, pid } = get()
      if (!selEdge) return
      set((state) => {
        const project = findProject(state, pid)
        if (project) {
          project.board.edges = project.board.edges.filter((e) => e.id !== selEdge)
          reconcileProject(project)
        }
        state.selEdge = null
      })
    },

    setMeshFilter(ext) {
      set((state) => {
        state.meshFilterExt = ext
      })
    },
    setPaletteHover(which) {
      set((state) => {
        state.paletteHover = which
      })
    },

    addFrame(rect) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        state.selFrame = addFrame(project, rect).id
        state.selId = null
        state.selEdge = null
      })
    },
    selectFrame(frameId) {
      set((state) => {
        state.selFrame = frameId
        if (frameId) {
          state.selId = null
          state.selEdge = null
        }
      })
    },
    moveFrame(frameId, x, y) {
      set((state) => {
        // only the frame: the nodes stay where they are (one it no longer
        // reaches is simply not in it any more)
        const frame = findProject(state, state.pid)?.board.frames.find((f) => f.id === frameId)
        if (!frame) return
        frame.x = x
        frame.y = y
      })
    },
    moveFrameScene(frameId, stageId, by) {
      set((state) => {
        const project = findProject(state, state.pid)
        const frame = project?.board.frames.find((f) => f.id === frameId)
        if (project && frame) moveInFrame(project, frame, stageId, by)
      })
    },
    resetFrameOrder(frameId) {
      set((state) => {
        const frame = findProject(state, state.pid)?.board.frames.find((f) => f.id === frameId)
        if (frame && frame.order.length) frame.order = []
      })
    },
    resizeFrame(frameId, rect) {
      set((state) => {
        const frame = findProject(state, state.pid)?.board.frames.find((f) => f.id === frameId)
        if (!frame) return
        frame.x = rect.x
        frame.y = rect.y
        frame.w = Math.max(FRAME_MIN_W, rect.w)
        frame.h = Math.max(FRAME_MIN_H, rect.h)
      })
    },
    renameFrame(frameId, label) {
      set((state) => {
        const frame = findProject(state, state.pid)?.board.frames.find((f) => f.id === frameId)
        if (frame && label.trim()) frame.label = label.trim()
      })
    },
    deleteFrame(frameId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project || !project.board.frames.some((f) => f.id === frameId)) return
        project.board.frames = project.board.frames.filter((f) => f.id !== frameId)
        if (state.selFrame === frameId) state.selFrame = null
      })
    },
  }

  /** The same action, undoable with the board's history. */
  const recorded =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A) =>
      recordBoardEdit(get, set, () => action(...args))

  return {
    ...actions,
    dropMeshOnBoard: recorded(actions.dropMeshOnBoard),
    dropStageOnBoard: recorded(actions.dropStageOnBoard),
    linkIfDropped: recorded(actions.linkIfDropped),
    renameNode: recorded(actions.renameNode),
    duplicateNode: recorded(actions.duplicateNode),
    deleteNode(nodeId) {
      const { pid, projects } = get()
      const node = projects.find((p) => p.id === pid)?.board.nodes.find((n) => n.id === nodeId)
      recorded(actions.deleteNode)(nodeId)
      // a stage goes with everything made inside it: say how to get it back
      if (node && node.kind !== 'mesh') {
        get().notify(`${stageName(node)} deleted — Ctrl+Z brings it back.`, 'info')
      }
    },
    completeLinking: recorded(actions.completeLinking),
    removeEdge: recorded(actions.removeEdge),
    deleteSelectedEdge: recorded(actions.deleteSelectedEdge),
    addFrame: recorded(actions.addFrame),
    renameFrame: recorded(actions.renameFrame),
    deleteFrame: recorded(actions.deleteFrame),
    moveFrameScene: recorded(actions.moveFrameScene),
    resetFrameOrder: recorded(actions.resetFrameOrder),
  }
}
