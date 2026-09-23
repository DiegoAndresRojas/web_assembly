import {
  nearestCandidates,
  pointWorld,
  rotateEulerInverse,
  solveAxisAlign,
  vec,
} from '@/lib/keypoints'
import { normalizeLink } from '@/lib/migrations'
import { num } from '@/lib/utils'
import { findProject } from './helpers'
import type { AssemblyActions, AssemblyState, Get, Set, StageSnapshot } from './types'
import type { Axis, KeypointCandidate, KeypointLink, Stage, StageMember } from '@/types/project'

const HISTORY_LIMIT = 20

export const initialAssemblyState: AssemblyState = {
  kpOn: false,
  kpMode: 'vm',
  pendingPicks: [],
  kpEditing: null,
  gapPending: null,
  canUndo: false,
  canRedo: false,
  history: [],
  future: [],
}

function snapshot(stage: Stage): StageSnapshot {
  return {
    members: JSON.parse(JSON.stringify(stage.members)),
    links: JSON.parse(JSON.stringify(stage.links)),
  }
}

/** Mutates `link` (state/gap) and `stage.members` in place. */
function solveLinkInPlace(stage: Stage, link: KeypointLink): void {
  const memberA = stage.members.find((m) => m.nodeId === link.nodeA)
  const memberB = stage.members.find((m) => m.nodeId === link.nodeB)
  if (!memberA || !memberB) {
    link.state = 'gap'
    link.gap = vec.distance(link.pointA, link.pointB)
    return
  }
  const deltaDeg = solveAxisAlign(link.axis, link.normalB, link.normalA)
  if (deltaDeg === null) {
    link.state = 'gap'
    link.gap = vec.distance(link.pointA, link.pointB)
    return
  }
  const oldRot = { ...memberB.pose.rot }
  const localB = rotateEulerInverse(vec.sub(link.pointB, memberB.pose.pos), oldRot)
  const newRot = { ...oldRot, [link.axis]: oldRot[link.axis] + deltaDeg }
  memberB.pose.rot = newRot
  const newWorldB = pointWorld({ pos: memberB.pose.pos, rot: newRot }, localB)
  const shift = vec.sub(link.pointA, newWorldB)
  memberB.pose.pos = vec.add(memberB.pose.pos, shift)
  link.state = 'solved'
  link.gap = 0
}

export function createAssemblySlice(set: Set, get: Get): AssemblyActions {
  function pushHistory() {
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
  }

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

    resolveKeypointCandidate(hit, candidates) {
      if (get().kpMode === 'fr' || !candidates.length) return hit
      const wantLabel: KeypointCandidate['label'] = get().kpMode === 'fm' ? 'face' : 'corner'
      const filtered = candidates.filter((c) => c.label === wantLabel)
      if (!filtered.length) return hit
      const nearest = nearestCandidates(filtered, hit.point, { limit: 1 })
      if (!nearest.length) return hit
      const c = nearest[0].point
      return {
        nodeId: hit.nodeId,
        point: { x: c.x, y: c.y, z: c.z },
        normal: { x: c.nx, y: c.ny, z: c.nz },
      }
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
        solveLinkInPlace(stage, link)
        createdId = link.id
        createdState = link.state
        createdGap = link.gap
        state.pendingPicks = []
        state.gapPending = createdState === 'gap' ? { linkId: createdId, gap: createdGap } : null
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

    undoLink() {
      if (!get().history.length) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        state.future.push(snapshot(stage))
        const prev = state.history.pop()
        if (prev) {
          stage.members = prev.members as StageMember[]
          stage.links = prev.links as KeypointLink[]
        }
        state.canUndo = state.history.length > 0
        state.canRedo = true
      })
    },
    redoLink() {
      if (!get().future.length) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        state.history.push(snapshot(stage))
        const next = state.future.pop()
        if (next) {
          stage.members = next.members as StageMember[]
          stage.links = next.links as KeypointLink[]
        }
        state.canUndo = true
        state.canRedo = state.future.length > 0
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
        const member = stage?.members.find((m) => m.nodeId === link?.nodeB)
        if (member) member.pose.rot[axis] = num(value, 0)
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
