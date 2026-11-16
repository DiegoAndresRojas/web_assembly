import type { Get, NavigationActions, NavigationState, Set } from './types'
import type { WorldMode } from '@/types/project'

export const initialNavigationState: NavigationState = {
  view: 'projects',
  pid: null,
  aid: null,
  wmode: 'assembly',
}

function wmodeForKind(kind: 'mesh' | 'assembly' | 'animation'): WorldMode {
  if (kind === 'animation') return 'animate'
  return 'assembly'
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
        state.view = 'projects'
        state.pid = null
      })
    },

    openStage(nodeId) {
      const { pid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const node = project?.board.nodes.find((n) => n.id === nodeId)
      set((state) => {
        state.view = 'world'
        state.aid = nodeId
        state.wmode = node ? wmodeForKind(node.kind) : 'assembly'
        state.kpOn = false
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
    },

    backToBoard() {
      set((state) => {
        state.view = 'board'
      })
    },
  }
}
