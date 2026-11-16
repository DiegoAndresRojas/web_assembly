import {
  bodyPose,
  isFreePart,
  lockPart,
  moveBodyTo,
  releasePart,
  restorePart,
  solveLink,
} from '@/lib/assembly'
import { assemblyParts, PART_SEP } from '@/lib/graph'
import { normalizeLink } from '@/lib/migrations'
import { num } from '@/lib/utils'
import { findProject } from './helpers'
import type { AssemblyActions, AssemblyState, Get, Set } from './types'
import type { Axis, KeypointLink } from '@/types/project'

export const initialAssemblyState: AssemblyState = {
  kpOn: false,
  kpMode: 'edges',
  pendingPicks: [],
  kpEditing: null,
  asmOpen: [],
  gapPending: null,
}

export function createAssemblySlice(set: Set, get: Get): AssemblyActions {
  const pushHistory = () => get().pushHistory()

  return {
    toggleKp(on) {
      set((state) => {
        state.kpOn = on
        state.pendingPicks = []
      })
    },
    setKpMode(mode) {
      set((state) => {
        state.kpMode = mode
      })
    },

    pickPoint(hit) {
      const pending = [...get().pendingPicks, hit]
      if (pending.length < 2) {
        set((state) => {
          state.pendingPicks = pending
        })
        return
      }
      const [a, b] = pending
      if (a.nodeId === b.nodeId) {
        set((state) => {
          state.pendingPicks = [b]
        })
        return
      }
      pushHistory()
      let createdId = ''
      let createdState: KeypointLink['state'] = 'solved'
      let createdGap = 0
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        const link = normalizeLink({
          nodeA: a.nodeId,
          pointA: a.point,
          normalA: a.normal,
          nodeB: b.nodeId,
          pointB: b.point,
          normalB: b.normal,
          axis: 'y',
        })!
        stage.links.push(link)
        // (the draft the stage holds, not the plain object just pushed)
        const added = stage.links[stage.links.length - 1]
        solveLink(stage, added)
        createdId = added.id
        createdState = added.state
        createdGap = added.gap
        state.pendingPicks = []
        state.gapPending = createdState === 'gap' ? { linkId: createdId, gap: createdGap } : null
      })
    },

    setMemberPose(nodeId, pose) {
      pushHistory()
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (stage) moveBodyTo(stage, nodeId, pose)
      })
    },

    toggleAsmOpen(asmId) {
      set((state) => {
        state.asmOpen = state.asmOpen.includes(asmId)
          ? state.asmOpen.filter((id) => id !== asmId)
          : [...state.asmOpen, asmId]
      })
    },
    togglePartLock(key) {
      pushHistory()
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!project || !stage) return
        const asmId = key.split(PART_SEP)[0]
        if (isFreePart(stage, key)) {
          lockPart(stage, key)
          // it is part of the assembly again: that is what stays selected
          if (state.worldSelId === key) state.worldSelId = asmId
          state.pendingPicks = state.pendingPicks.filter((p) => p.nodeId !== key)
          return
        }
        const part = assemblyParts(project, asmId).find((p) => p.key === key)
        if (!part) return
        releasePart(stage, key, part.pose)
        state.worldSelId = key
      })
    },
    restorePart(key) {
      pushHistory()
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        restorePart(stage, key)
        if (state.worldSelId === key) state.worldSelId = key.split(PART_SEP)[0]
        state.pendingPicks = state.pendingPicks.filter((p) => p.nodeId !== key)
      })
    },

    removeLink(linkId) {
      pushHistory()
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (stage) stage.links = stage.links.filter((l) => l.id !== linkId)
      })
    },
    acceptGap() {
      set((state) => {
        state.gapPending = null
      })
    },
    rejectGap() {
      const pending = get().gapPending
      if (pending) get().removeLink(pending.linkId)
      set((state) => {
        state.gapPending = null
      })
    },

    openKpEdit(linkId) {
      set((state) => {
        state.kpEditing = linkId
      })
    },
    closeKpEdit() {
      set((state) => {
        state.kpEditing = null
      })
    },
    cancelKpEdit() {
      set((state) => {
        state.kpEditing = null
      })
    },
    setKpRotAxis(axis: Axis, value: number) {
      const linkId = get().kpEditing
      if (!linkId) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const link = stage?.links.find((l) => l.id === linkId)
        const pose = stage && link ? bodyPose(stage, link.nodeB) : null
        if (pose) pose.rot[axis] = num(value, 0)
      })
    },

    doUnion() {
      set((state) => {
        const project = findProject(state, state.pid)
        if (project && state.aid) project.stages[state.aid].union = { at: Date.now() }
      })
    },
    undoUnion() {
      set((state) => {
        const project = findProject(state, state.pid)
        if (project && state.aid) project.stages[state.aid].union = null
      })
    },
  }
}
