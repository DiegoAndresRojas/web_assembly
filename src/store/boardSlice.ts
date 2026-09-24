import { MESH_H, MESH_W, NODE_W, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/lib/constants'
import { edgeFor, keyRefersTo } from '@/lib/graph'
import { normalizeStage } from '@/lib/migrations'
import { clamp, uid } from '@/lib/utils'
import { findProject } from './helpers'
import type { BoardActions, BoardState, Get, Set } from './types'
import type { NodeKind } from '@/types/project'

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
  hoverObserver: false,
  hoverAnimation: false,
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
    panBy(dx, dy) {
      set((state) => {
        state.pan = { x: state.pan.x + dx, y: state.pan.y + dy }
      })
    },
    setPan(x, y) {
      set((state) => {
        state.pan = { x, y }
      })
    },

    dropMeshOnBoard(meshId, x, y) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        project.board.nodes.push({ id: uid(), kind: 'mesh', x, y, meshId, label: null, color: null })
      })
    },
    dropStageOnBoard(kind, x, y) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const count = project.board.nodes.filter((n) => n.kind === kind).length + 1
        const label = kind[0].toUpperCase() + kind.slice(1) + ' ' + count
        const id = uid()
        project.board.nodes.push({ id, kind, x, y, meshId: null, label, color: null })
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
      // Dragging a mesh node's own body on top of a stage node (the
      // intuitive gesture) links them too — not just dragging from the
      // tiny link handle, which is easy to miss since it only appears on
      // hover.
      set((state) => {
        const project = findProject(state, state.pid)
        const dragged = project?.board.nodes.find((n) => n.id === nodeId)
        if (!project || !dragged) return
        // Look for a node of the OPPOSITE kind first — dropping a mesh
        // that ends up overlapping both a stage node and another mesh
        // node (e.g. two meshes dropped on the very same spot) must not
        // match the other mesh instead of the stage.
        const wantsStage = dragged.kind === 'mesh'
        const overlapping = (n: (typeof project.board.nodes)[number]) =>
          n.id !== dragged.id && pointInNode(n.kind, n.x, n.y, dragged.x, dragged.y)
        const target =
          project.board.nodes.find((n) => overlapping(n) && (n.kind === 'mesh') !== wantsStage) ??
          project.board.nodes.find((n) => overlapping(n) && (n.kind === 'mesh') === wantsStage)
        if (!target) return
        const meshEnd = dragged.kind === 'mesh' ? dragged : target
        const stageEnd = dragged.kind === 'mesh' ? target : dragged
        if (meshEnd.kind !== 'mesh' || stageEnd.kind === 'mesh') return
        const exists = project.board.edges.some(
          (e) => e.from === meshEnd.id && e.to === stageEnd.id,
        )
        if (!exists) project.board.edges.push({ id: uid(), from: meshEnd.id, to: stageEnd.id })
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
          stage.links = stage.links.filter((l) => l.nodeA !== nodeId && l.nodeB !== nodeId)
          stage.tracks = stage.tracks.filter((t) => !t.nodeId || !keyRefersTo(t.nodeId, nodeId))
          stage.observing = stage.observing.filter((id) => id !== nodeId)
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
          if (!exists) project.board.edges.push({ id: uid(), ...edge })
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
        state.hoverObserver = which === 'observer'
        state.hoverAnimation = which === 'animation'
      })
    },
  }
}
