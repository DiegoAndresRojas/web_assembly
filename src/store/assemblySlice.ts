import * as THREE from 'three'

import { solveAxisAlign, vec } from '@/lib/keypoints'
import { normalizeLink } from '@/lib/migrations'
import { num } from '@/lib/utils'
import { findProject } from './helpers'
import type { AssemblyActions, AssemblyState, Get, Set } from './types'
import type { Axis, KeypointLink, Stage, Vec3 } from '@/types/project'

export const initialAssemblyState: AssemblyState = {
  kpOn: false,
  kpMode: 'edges',
  pendingPicks: [],
  kpEditing: null,
  gapPending: null,
}

const WORLD_AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

function poseQuaternion(rot: Vec3): THREE.Quaternion {
  const toRad = THREE.MathUtils.degToRad
  // same Euler order applyPose() hands to three.js
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(toRad(rot.x), toRad(rot.y), toRad(rot.z), 'XYZ'),
  )
}

/** Mutates `link` (state/gap) and `stage.members` in place: turns B about
 *  the link's WORLD axis so its point normal faces A's, then slides B so
 *  the two points coincide. When no turn about that axis can face the
 *  normals (e.g. one of them is parallel to the axis — a corner picked
 *  from a top face), B is only slid, so the points still meet. */
function solveLinkInPlace(stage: Stage, link: KeypointLink): void {
  const memberA = stage.members.find((m) => m.nodeId === link.nodeA)
  const memberB = stage.members.find((m) => m.nodeId === link.nodeB)
  if (!memberA || !memberB) {
    link.state = 'gap'
    link.gap = vec.distance(link.pointA, link.pointB)
    return
  }
  const deltaDeg = solveAxisAlign(link.axis, link.normalB, link.normalA) ?? 0

  const pos = new THREE.Vector3(memberB.pose.pos.x, memberB.pose.pos.y, memberB.pose.pos.z)
  const oldQ = poseQuaternion(memberB.pose.rot)
  const turn = new THREE.Quaternion().setFromAxisAngle(
    WORLD_AXES[link.axis],
    THREE.MathUtils.degToRad(deltaDeg),
  )
  const newQ = turn.clone().multiply(oldQ)

  // B's picked point in B's local frame, then back out under the new turn
  const localB = new THREE.Vector3(link.pointB.x, link.pointB.y, link.pointB.z)
    .sub(pos)
    .applyQuaternion(oldQ.clone().invert())
  const newWorldB = localB.applyQuaternion(newQ).add(pos)
  const newPos = pos.add(
    new THREE.Vector3(link.pointA.x, link.pointA.y, link.pointA.z).sub(newWorldB),
  )

  const e = new THREE.Euler().setFromQuaternion(newQ, 'XYZ')
  const toDeg = THREE.MathUtils.radToDeg
  memberB.pose.rot = { x: toDeg(e.x), y: toDeg(e.y), z: toDeg(e.z) }
  memberB.pose.pos = { x: newPos.x, y: newPos.y, z: newPos.z }
  link.state = 'solved'
  link.gap = 0
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
        solveLinkInPlace(stage, link)
        createdId = link.id
        createdState = link.state
        createdGap = link.gap
        state.pendingPicks = []
        state.gapPending = createdState === 'gap' ? { linkId: createdId, gap: createdGap } : null
      })
    },

    setMemberPose(nodeId, pose) {
      pushHistory()
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const member = stage?.members.find((m) => m.nodeId === nodeId)
        if (member) member.pose = { pos: { ...pose.pos }, rot: { ...pose.rot } }
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
