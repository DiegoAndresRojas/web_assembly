import { meshForNodeId } from '@/lib/graph'
import { normalizeAction, normalizeTrack } from '@/lib/migrations'
import { nextActionDefaults, stageDuration } from '@/lib/timeline'
import { num } from '@/lib/utils'
import { findProject } from './helpers'
import type { AnimationActions, AnimationState, Get, PoseDraft, Set } from './types'
import type { Axis } from '@/types/project'

export const initialAnimationState: AnimationState = {
  playT: 0,
  playing: false,
  cfgTarget: null,
  cfgDraft: null,
}

function clonePose(p: PoseDraft): PoseDraft {
  return { pos: { ...p.pos }, rot: { ...p.rot } }
}

export function createAnimationSlice(set: Set, get: Get): AnimationActions {
  return {
    onAnimPlay() {
      const { pid, aid, projects, playT } = get()
      const project = projects.find((p) => p.id === pid)
      const stage = project && aid ? project.stages[aid] : undefined
      const dur = stage ? stageDuration(stage) : 0
      set((state) => {
        if (playT >= dur) state.playT = 0
        state.playing = !state.playing
      })
    },
    onAnimReset() {
      set((state) => {
        state.playing = false
        state.playT = 0
      })
    },
    onObsPlay() {
      set((state) => {
        state.playing = !state.playing
      })
    },
    onObsReset() {
      set((state) => {
        state.playing = false
        state.playT = 0
      })
    },
    seekTo(t) {
      set((state) => {
        state.playT = Math.max(0, t)
        state.playing = false
      })
    },

    addMeshTrack(nodeId) {
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        if (!stage.members.some((m) => m.nodeId === nodeId)) {
          stage.members.push({
            nodeId,
            visible: true,
            opacity: 1,
            pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
            color: null,
          })
        }
        if (!stage.tracks.some((t) => t.nodeId === nodeId)) {
          const member = stage.members.find((m) => m.nodeId === nodeId)!
          stage.tracks.push(normalizeTrack({ targetKind: 'mesh', nodeId, initPose: member.pose })!)
        }
      })
    },
    addCameraTrack(currentCameraPose) {
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (!stage) return
        if (!stage.camera) {
          stage.camera = {
            pose: currentCameraPose ?? { pos: { x: 4, y: 3, z: 5 }, rot: { x: 0, y: 0, z: 0 } },
            tracked: true,
          }
        }
        if (!stage.tracks.some((t) => t.targetKind === 'camera')) {
          stage.tracks.push(normalizeTrack({ targetKind: 'camera', initPose: stage.camera.pose })!)
        }
      })
    },
    removeTrack(trackId) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const stage = project && aid ? project.stages[aid] : undefined
      const track = stage?.tracks.find((t) => t.id === trackId)
      if (track && track.actions.length) {
        const mesh =
          track.targetKind === 'mesh' ? meshForNodeId(project ?? null, track.nodeId) : null
        set((state) => {
          state.confirm = {
            kind: 'track',
            id: trackId,
            label: track.targetKind === 'camera' ? 'Camera' : (mesh?.name ?? 'Mesh'),
          }
        })
        return
      }
      set((state) => {
        const p = findProject(state, state.pid)
        const s = p && state.aid ? p.stages[state.aid] : undefined
        if (s) s.tracks = s.tracks.filter((t) => t.id !== trackId)
      })
    },
    confirmRemoveTrack() {
      const confirm = get().confirm
      if (!confirm || confirm.kind !== 'track') return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (stage) stage.tracks = stage.tracks.filter((t) => t.id !== confirm.id)
        state.confirm = null
      })
    },

    onCamKill() {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const stage = project && aid ? project.stages[aid] : undefined
      const camTrack = stage?.tracks.find((t) => t.targetKind === 'camera')
      if (camTrack && camTrack.actions.length) {
        set((state) => {
          state.confirm = { kind: 'camera', id: camTrack.id, label: 'Camera' }
        })
        return
      }
      set((state) => {
        const p = findProject(state, state.pid)
        const s = p && state.aid ? p.stages[state.aid] : undefined
        if (s) {
          s.camera = null
          s.tracks = s.tracks.filter((t) => t.targetKind !== 'camera')
        }
      })
    },
    confirmCamDelete() {
      const confirm = get().confirm
      if (!confirm || confirm.kind !== 'camera') return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        if (stage) {
          stage.camera = null
          stage.tracks = stage.tracks.filter((t) => t.targetKind !== 'camera')
        }
        state.confirm = null
      })
    },
    cancelCamDelete() {
      set((state) => {
        state.confirm = null
      })
    },

    openInitEditor(trackId) {
      const { pid, aid, projects } = get()
      const stage = projects.find((p) => p.id === pid)?.stages[aid ?? '']
      const track = stage?.tracks.find((t) => t.id === trackId)
      if (!track) return
      set((state) => {
        state.cfgTarget = { trackId, actionId: null, isNew: false, isInit: true }
        state.cfgDraft = {
          fromPose: clonePose(track.initPose),
          toPose: clonePose(track.initPose),
          start: 0,
          duration: 1,
          toLinked: false,
          editingSide: null,
        }
      })
    },
    openNewAction(trackId) {
      const { pid, aid, projects } = get()
      const stage = projects.find((p) => p.id === pid)?.stages[aid ?? '']
      const track = stage?.tracks.find((t) => t.id === trackId)
      if (!track) return
      const d = nextActionDefaults(track)
      set((state) => {
        state.cfgTarget = { trackId, actionId: null, isNew: true, isInit: false }
        state.cfgDraft = {
          fromPose: d.fromPose,
          toPose: d.toPose,
          start: d.start,
          duration: d.duration,
          toLinked: false,
          editingSide: null,
        }
      })
    },
    openAction(trackId, actionId) {
      const { pid, aid, projects } = get()
      const stage = projects.find((p) => p.id === pid)?.stages[aid ?? '']
      const track = stage?.tracks.find((t) => t.id === trackId)
      const action = track?.actions.find((a) => a.id === actionId)
      if (!action) return
      set((state) => {
        state.cfgTarget = { trackId, actionId, isNew: false, isInit: false }
        state.cfgDraft = {
          fromPose: clonePose(action.fromPose),
          toPose: clonePose(action.toPose),
          start: action.start,
          duration: action.duration,
          toLinked: action.toLinked,
          editingSide: null,
        }
      })
    },

    tlCancelConfig() {
      set((state) => {
        state.cfgTarget = null
        state.cfgDraft = null
      })
    },
    tlSaveConfig() {
      const { cfgTarget: target, cfgDraft: draft } = get()
      if (!target || !draft) return
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const track = stage?.tracks.find((t) => t.id === target.trackId)
        if (!track) return
        if (target.isInit) {
          track.initPose = clonePose(draft.fromPose)
        } else if (target.isNew) {
          track.actions.push(
            normalizeAction({
              fromPose: draft.fromPose,
              toPose: draft.toPose,
              start: draft.start,
              duration: draft.duration,
              toLinked: draft.toLinked,
            })!,
          )
        } else {
          const action = track.actions.find((a) => a.id === target.actionId)
          if (action) {
            action.fromPose = clonePose(draft.fromPose)
            action.toPose = clonePose(draft.toPose)
            action.start = num(draft.start, 0)
            action.duration = Math.max(0.1, num(draft.duration, 1))
            action.toLinked = draft.toLinked
          }
        }
        state.cfgTarget = null
        state.cfgDraft = null
      })
    },
    onCfgDelete() {
      const target = get().cfgTarget
      if (!target || target.isInit || target.isNew) {
        get().tlCancelConfig()
        return
      }
      set((state) => {
        const project = findProject(state, state.pid)
        const stage = project && state.aid ? project.stages[state.aid] : undefined
        const track = stage?.tracks.find((t) => t.id === target.trackId)
        if (track) track.actions = track.actions.filter((a) => a.id !== target.actionId)
        state.cfgTarget = null
        state.cfgDraft = null
      })
    },

    setDraftStart(v) {
      set((state) => {
        if (state.cfgDraft) state.cfgDraft.start = num(v, 0)
      })
    },
    setDraftDuration(v) {
      set((state) => {
        if (state.cfgDraft) state.cfgDraft.duration = Math.max(0.1, num(v, 1))
      })
    },
    setDraftAxis(side, kind, axis: Axis, value) {
      set((state) => {
        const draft = state.cfgDraft
        if (!draft) return
        const pose = side === 'from' ? draft.fromPose : draft.toPose
        pose[kind][axis] = value
      })
    },
    setEditingSide(side) {
      set((state) => {
        if (state.cfgDraft) state.cfgDraft.editingSide = side
      })
    },
    setDraftPoseFromCamera(side, pose) {
      set((state) => {
        if (!state.cfgDraft) return
        if (side === 'from') state.cfgDraft.fromPose = clonePose(pose)
        else state.cfgDraft.toPose = clonePose(pose)
      })
    },
    setDraftToLinked(checked) {
      set((state) => {
        if (state.cfgDraft) state.cfgDraft.toLinked = checked
      })
    },
  }
}
