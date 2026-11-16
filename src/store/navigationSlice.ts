import type { Draft } from 'immer'

import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { PART_SEP } from '@/lib/graph'
import type { AppState, Get, NavigationActions, NavigationState, Set, StageView } from './types'
import type { Stage, WorldMode } from '@/types/project'

export const initialNavigationState: NavigationState = {
  view: 'projects',
  pid: null,
  aid: null,
  wmode: 'assembly',
  stageViews: {},
}

function wmodeForKind(kind: 'mesh' | 'assembly' | 'animation'): WorldMode {
  if (kind === 'animation') return 'animate'
  return 'assembly'
}

/** Notes how the open stage's view is being left (the working camera is
 *  added by the 3D view itself as it closes — see rememberOrbit). */
function rememberStageView(state: Draft<AppState>): void {
  if (state.view !== 'world' || !state.aid) return
  state.stageViews[state.aid] = {
    asmOpen: [...state.asmOpen],
    worldSelId: state.worldSelId,
    playT: state.playT,
    selection: state.selection ? { ...state.selection } : null,
    orbit: state.stageViews[state.aid]?.orbit ?? null,
  }
}

/** A remembered view, minus whatever the stage no longer has (inputs
 *  unwired, tracks or actions deleted since). */
export function validStageView(view: StageView | undefined, stage: Stage | undefined): StageView {
  const empty: StageView = { asmOpen: [], worldSelId: null, playT: 0, selection: null, orbit: null }
  if (!view || !stage) return empty
  const isInput = (key: string) => {
    const top = key.split(PART_SEP)[0]
    if (top === ANIM_CAMERA_KEY) return !!stage.camera
    return stage.members.some((m) => m.nodeId === top)
  }
  const sel = view.selection
  const track = sel ? stage.tracks.find((t) => t.id === sel.trackId) : undefined
  const selectionOk =
    !!sel && !!track && (sel.actionId === 'init' || track.actions.some((a) => a.id === sel.actionId))
  return {
    asmOpen: view.asmOpen.filter(isInput),
    worldSelId: view.worldSelId && isInput(view.worldSelId) ? view.worldSelId : null,
    playT: Math.max(0, view.playT),
    selection: selectionOk ? sel : null,
    orbit: view.orbit,
  }
}

export function createNavigationSlice(set: Set, get: Get): NavigationActions {
  return {
    openProject(id) {
      set((state) => {
        state.view = 'board'
        state.pid = id
        state.pan = { x: 60, y: 60 }
        state.zoom = 1
      })
    },

    backToProjects() {
      set((state) => {
        rememberStageView(state)
        state.view = 'projects'
        state.pid = null
      })
    },

    openStage(nodeId) {
      const { pid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const node = project?.board.nodes.find((n) => n.id === nodeId)
      set((state) => {
        rememberStageView(state)
        state.view = 'world'
        state.aid = nodeId
        state.wmode = node ? wmodeForKind(node.kind) : 'assembly'
        state.kpOn = false
        state.pendingPicks = []
        state.asmOpen = []
        state.hint = 'Loading…'
        state.worldSelId = null
        state.playing = false
        state.playT = 0
        state.selection = null
      })
      // undo history belongs to the stage being left
      get().clearHistory()
      // Creates the stage record (if this is the first time it's opened)
      // and makes sure every mesh wired in via board edges has a member
      // row — without this, WorldView has nothing to render.
      get().syncStageMembers(nodeId)
      // back as it was left, as far as the stage still has it
      set((state) => {
        const stage = state.projects.find((p) => p.id === state.pid)?.stages[nodeId]
        const view = validStageView(state.stageViews[nodeId], stage)
        state.asmOpen = view.asmOpen
        state.worldSelId = view.worldSelId
        state.playT = view.playT
        state.selection = view.selection
      })
    },

    backToBoard() {
      set((state) => {
        rememberStageView(state)
        state.view = 'board'
      })
    },

    rememberOrbit(stageId, orbit) {
      set((state) => {
        const view = state.stageViews[stageId]
        if (view) view.orbit = orbit
        else {
          state.stageViews[stageId] = {
            asmOpen: [],
            worldSelId: null,
            playT: 0,
            selection: null,
            orbit,
          }
        }
      })
    },
  }
}
