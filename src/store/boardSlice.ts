import { MESH_H, MESH_W, NODE_W, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/lib/constants'
import { duplicateNode } from '@/lib/duplicate'
import { edgeFor, keyRefersTo } from '@/lib/graph'
import { normalizeStage } from '@/lib/migrations'
import type { Draft } from 'immer'

import { recoverFromChain } from '@/lib/chain'
import { recoverLightsFromChain } from '@/lib/lights'
import { clamp, uid } from '@/lib/utils'
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
  linking: null,
  meshFilterExt: null,
  hoverAssembly: false,
  hoverAnimation: false,
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
  return {
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
        if (!exists) project.board.edges.push({ id: uid(), from: dragged.id, to: target.id })
      })
    },
    selectNode(nodeId) {
      set((state) => {
        state.selId = nodeId
        state.selEdge = null
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
        if (id) state.selId = id
      })
    },
    deleteNode(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const node = project.board.nodes.find((n) => n.id === nodeId)
        project.board.nodes = project.board.nodes.filter((n) => n.id !== nodeId)
        project.board.edges = project.board.edges.filter(
          (e) => e.from !== nodeId && e.to !== nodeId,
        )
        if (node && node.kind !== 'mesh') delete project.stages[nodeId]
        // meshes and upstream assemblies are both stage inputs — drop every
        // downstream reference to the deleted node
        for (const stageId in project.stages) {
          const stage = project.stages[stageId]
          stage.members = stage.members.filter((m) => m.nodeId !== nodeId)
          stage.links = stage.links.filter(
            (l) => !keyRefersTo(l.nodeA, nodeId) && !keyRefersTo(l.nodeB, nodeId),
          )
          for (const key of Object.keys(stage.partOverrides)) {
            if (keyRefersTo(key, nodeId)) delete stage.partOverrides[key]
          }
          for (const key of Object.keys(stage.startPoses)) {
            if (keyRefersTo(key, nodeId)) delete stage.startPoses[key]
          }
          stage.tracks = stage.tracks.filter((t) => !t.nodeId || !keyRefersTo(t.nodeId, nodeId))
          for (const key of Object.keys(stage.partLooks ?? {})) {
            if (keyRefersTo(key, nodeId)) delete stage.partLooks[key]
          }
        }
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
      })
    },
    removeEdge(edgeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (project) project.board.edges = project.board.edges.filter((e) => e.id !== edgeId)
        if (state.selEdge === edgeId) state.selEdge = null
      })
    },
    deleteSelectedEdge() {
      const { selEdge, pid } = get()
      if (!selEdge) return
      set((state) => {
        const project = findProject(state, pid)
        if (project) project.board.edges = project.board.edges.filter((e) => e.id !== selEdge)
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
        state.hoverAssembly = which === 'assembly'
        state.hoverAnimation = which === 'animation'
      })
    },
  }
}
