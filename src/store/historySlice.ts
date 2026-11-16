// Undo/redo for the open stage: every edit worth undoing — keypoint links,
// gizmo moves, animation tracks and actions — snapshots the stage's
// editable data first (pushHistory). Cleared whenever a stage is opened, so
// a snapshot is never restored onto a different stage.
import { findProject } from './helpers'
import type { Get, HistoryActions, HistoryState, Set, StageSnapshot } from './types'
import type { Stage } from '@/types/project'

const HISTORY_LIMIT = 50

export const initialHistoryState: HistoryState = {
  canUndo: false,
  canRedo: false,
  history: [],
  future: [],
}

function snapshot(stage: Stage): StageSnapshot {
  return JSON.parse(
    JSON.stringify({
      members: stage.members,
      links: stage.links,
      tracks: stage.tracks,
      camera: stage.camera,
    }),
  )
}

function restore(stage: Stage, snap: StageSnapshot): void {
  stage.members = snap.members
  stage.links = snap.links
  stage.tracks = snap.tracks
  stage.camera = snap.camera
}

export function createHistorySlice(set: Set, get: Get): HistoryActions {
  return {
    pushHistory() {
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        state.history.push(snapshot(stage))
        if (state.history.length > HISTORY_LIMIT) state.history.shift()
        state.future = []
        state.canUndo = true
        state.canRedo = false
      })
    },
    undo() {
      if (!get().history.length) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const prev = state.history.pop()
        if (!stage || !prev) return
        state.future.push(snapshot(stage))
        restore(stage, prev)
        state.canUndo = state.history.length > 0
        state.canRedo = true
      })
    },
    redo() {
      if (!get().future.length) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const next = state.future.pop()
        if (!stage || !next) return
        state.history.push(snapshot(stage))
        restore(stage, next)
        state.canUndo = true
        state.canRedo = state.future.length > 0
      })
    },
    clearHistory() {
      set((state) => {
        state.history = []
        state.future = []
        state.canUndo = false
        state.canRedo = false
      })
    },
  }
}
