import { keyRefersTo, membersOf } from '@/lib/graph'
import { normalizeStage } from '@/lib/migrations'
import { clamp } from '@/lib/utils'
import { ensureStage, findProject, stageKindFromNode } from './helpers'
import type { Get, Set, WorldActions, WorldState } from './types'

export const initialWorldState: WorldState = {
  worldSelId: null,
  gizmoMode: 'translate',
  hint: '',
  opacityOpenId: null,
}

export function createWorldSlice(set: Set, get: Get): WorldActions {
  return {
    selectWorldObject(nodeId) {
      set((state) => {
        state.worldSelId = nodeId
      })
    },
    setGizmoMode(mode) {
      set((state) => {
        state.gizmoMode = mode
      })
    },
    setHint(hint) {
      set((state) => {
        state.hint = hint
      })
    },

    toggleMemberVisible(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const member = stage?.members.find((m) => m.nodeId === nodeId)
        if (member) member.visible = !member.visible
      })
    },
    setMemberOpacity(nodeId, value) {
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const member = stage?.members.find((m) => m.nodeId === nodeId)
        if (member) member.opacity = clamp(value, 0.05, 1)
      })
    },
    toggleOpacityUI(nodeId) {
      set((state) => {
        state.opacityOpenId = state.opacityOpenId === nodeId ? null : nodeId
      })
    },
    removeMember(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        const aid = state.aid
        if (!project || !aid) return
        project.board.edges = project.board.edges.filter(
          (e) => !(e.from === nodeId && e.to === aid),
        )
        const stage = project.stages[aid]
        if (stage) {
          stage.members = stage.members.filter((m) => m.nodeId !== nodeId)
          stage.tracks = stage.tracks.filter((t) => !t.nodeId || !keyRefersTo(t.nodeId, nodeId))
          stage.links = stage.links.filter((l) => l.nodeA !== nodeId && l.nodeB !== nodeId)
        }
        if (state.worldSelId === nodeId) state.worldSelId = null
      })
    },

    /** Makes sure every mesh wired into the stage (via board edges) has a
     *  persisted member record. Called whenever a stage is opened.
     *
     *  New members start at the origin rather than some fixed grid offset:
     *  meshes keep whatever scale they were authored in (see
     *  lib/three/buildMesh.ts), which now varies wildly from project to
     *  project, so any fixed spacing here would be meaningless for most
     *  of them anyway — the "eye" toggle plus keypoint linking is how
     *  overlapping parts actually get organized. */
    syncStageMembers(stageId) {
      set((state) => {
        const project = findProject(state, state.pid)
        if (!project) return
        const stage = ensureStage(project, stageId, stageKindFromNode(project, stageId))
        const rows = membersOf(project, stageId)
        rows.forEach((row) => {
          if (!stage.members.some((m) => m.nodeId === row.node.id)) {
            stage.members.push({
              nodeId: row.node.id,
              visible: true,
              opacity: 1,
              pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
              color: null,
            })
          }
        })
      })
    },

    observableStages() {
      const { aid, pid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      if (!project) return []
      return project.board.nodes
        .filter((n) => n.id !== aid && n.kind !== 'mesh')
        .map((n) => ({ id: n.id, label: n.label ?? n.kind }))
    },
    toggleObserve(stageNodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        const aid = state.aid
        if (!project || !aid) return
        const stage =
          project.stages[aid] ?? (project.stages[aid] = normalizeStage({ kind: 'observer' }))
        const i = stage.observing.indexOf(stageNodeId)
        if (i >= 0) stage.observing.splice(i, 1)
        else stage.observing.push(stageNodeId)
      })
    },
    removeObserved(stageNodeId) {
      get().toggleObserve(stageNodeId)
    },
  }
}
