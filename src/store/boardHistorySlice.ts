// Undo/redo for the board: nodes, edges, frames, the library — and the
// stage records that go with them (deleting a node takes its stage along).
//
// A snapshot is the open project's parts as they were. The store never
// changes an object in place (immer), so a snapshot only holds on to the
// old objects: nothing is copied. They are kept out of the store itself —
// only "is there something to undo" lives there.
//
// Cleared when a project or a stage is opened: what is edited inside a
// stage has its own history (historySlice), and a board snapshot from
// before would undo that work along with the board.
import type { BoardHistoryActions, BoardHistoryState, Get, Set } from './types'
import type { Project } from '@/types/project'

const HISTORY_LIMIT = 50

type Snapshot = Pick<Project, 'id' | 'meshes' | 'board' | 'stages'>

const past: Snapshot[] = []
const future: Snapshot[] = []

export const initialBoardHistoryState: BoardHistoryState = {
  canBoardUndo: false,
  canBoardRedo: false,
}

function take(get: Get): Snapshot | null {
  const state = get()
  const p = state.projects.find((x) => x.id === state.pid)
  return p ? { id: p.id, meshes: p.meshes, board: p.board, stages: p.stages } : null
}

function same(a: Snapshot, b: Snapshot): boolean {
  return a.id === b.id && a.meshes === b.meshes && a.board === b.board && a.stages === b.stages
}

function flag(set: Set): void {
  set((state) => {
    state.canBoardUndo = past.length > 0
    state.canBoardRedo = future.length > 0
  })
}

function remember(set: Set, snapshot: Snapshot): void {
  past.push(snapshot)
  if (past.length > HISTORY_LIMIT) past.shift()
  future.length = 0
  flag(set)
}

/** Runs a board edit and makes it undoable — if it changed anything. */
export function recordBoardEdit(get: Get, set: Set, edit: () => void): void {
  const before = take(get)
  edit()
  const after = take(get)
  if (before && after && !same(before, after)) remember(set, before)
}

function put(set: Set, snapshot: Snapshot): void {
  set((state) => {
    const project = state.projects.find((p) => p.id === snapshot.id)
    if (!project) return
    project.meshes = snapshot.meshes
    project.board = snapshot.board
    project.stages = snapshot.stages
    state.selIds = state.selIds.filter((id) => snapshot.board.nodes.some((n) => n.id === id))
    state.selId = state.selIds.length === 1 ? state.selIds[0] : null
    if (!snapshot.board.frames.some((f) => f.id === state.selFrame)) state.selFrame = null
    if (!snapshot.board.edges.some((e) => e.id === state.selEdge)) state.selEdge = null
    state.linking = null
  })
}

export function createBoardHistorySlice(set: Set, get: Get): BoardHistoryActions {
  const step = (from: Snapshot[], to: Snapshot[]) => {
    const now = take(get)
    const target = from[from.length - 1]
    if (!now || !target || target.id !== now.id) return
    from.pop()
    to.push(now)
    put(set, target)
    flag(set)
  }
  return {
    pushBoardHistory() {
      const now = take(get)
      if (now) remember(set, now)
    },
    boardUndo() {
      step(past, future)
    },
    boardRedo() {
      step(future, past)
    },
    clearBoardHistory() {
      past.length = 0
      future.length = 0
      flag(set)
    },
  }
}
