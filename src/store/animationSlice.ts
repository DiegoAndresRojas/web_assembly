// Animation stage editing: tracks (one per piece — a mesh, an assembly
// input, a part inside one, or the camera) holding chained move actions,
// plus the timeline's own UI state (playhead, zoom, snapping, selection).
// Every committed edit is undoable through the shared history slice.
import { cameraSources, DEFAULT_CAMERA_NAME } from '@/lib/cameras'
import { effectiveTrack, holdStartPoses, importedPoses, recoverFromChain } from '@/lib/chain'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { inputLabel, PART_SEP, partForKey, restPoseOf } from '@/lib/graph'
import { normalizeAction, normalizeTrack } from '@/lib/migrations'
import {
  MIN_ACTION_S,
  actionEnd,
  freeSlotAt,
  poseAtTime,
  resolveActions,
  sortedActions,
  stageDuration,
  trackDuration,
} from '@/lib/timeline'
import { clamp } from '@/lib/utils'
import { findProject } from './helpers'
import type { AnimationActions, AnimationState, AppState, Get, Set } from './types'
import type { Pose, Project, Stage, Track } from '@/types/project'
import type { Draft } from 'immer'

export const initialAnimationState: AnimationState = {
  playT: 0,
  playing: false,
  loop: false,
  snap: true,
  pxPerSecond: 80,
  dockHeight: 280,
  cameraView: true,
  selection: null,
}

export const ZOOM_RANGE = { min: 20, max: 400 }
export const DOCK_RANGE = { min: 160, max: 640 }

function clonePose(p: Pose): Pose {
  return { pos: { ...p.pos }, rot: { ...p.rot } }
}

function openStage(
  state: Draft<AppState>,
): { project: Draft<Project>; stage: Draft<Stage> } | null {
  const project = findProject(state, state.pid)
  const stage = project && state.aid ? project.stages[state.aid] : undefined
  return project && stage ? { project, stage } : null
}

/** Connector pose for a track's piece (null for the camera). */
function trackRest(project: Project, stageId: string, track: Track): Pose | null {
  return track.nodeId ? restPoseOf(project, stageId, track.nodeId) : null
}

export function createAnimationSlice(set: Set, get: Get): AnimationActions {
  const pushHistory = () => get().pushHistory()

  const actions: AnimationActions = {
    onAnimPlay() {
      const { pid, aid, projects, playT, playing } = get()
      const stage = projects.find((p) => p.id === pid)?.stages[aid ?? '']
      const dur = stage ? stageDuration(stage) : 0
      set((state) => {
        if (!playing && playT >= dur) state.playT = 0
        state.playing = !playing && dur > 0
      })
    },
    seekTo(t) {
      set((state) => {
        state.playT = Math.max(0, t)
        state.playing = false
      })
    },
    setLoop(on) {
      set((state) => {
        state.loop = on
      })
    },
    setSnap(on) {
      set((state) => {
        state.snap = on
      })
    },
    setZoom(px) {
      set((state) => {
        state.pxPerSecond = clamp(px, ZOOM_RANGE.min, ZOOM_RANGE.max)
      })
    },
    setDockHeight(px) {
      set((state) => {
        state.dockHeight = clamp(px, DOCK_RANGE.min, DOCK_RANGE.max)
      })
    },
    setCameraView(on) {
      set((state) => {
        state.cameraView = on
      })
    },
    setStageFrame(format) {
      set((state) => {
        const stage = state.projects.find((p) => p.id === state.pid)?.stages[state.aid ?? '']
        if (stage) stage.frame = format
      })
    },

    addMeshTrack(nodeId) {
      const found = get().projects.find((p) => p.id === get().pid)?.stages[get().aid ?? '']
      if (!found || found.tracks.some((t) => t.nodeId === nodeId)) return
      pushHistory()
      set((state) => {
        const open = openStage(state)
        if (!open) return
        const { project, stage } = open
        // putting a piece (or a whole assembly) on the timeline is where it
        // takes up from the animation before this one in the chain
        if (state.aid) recoverFromChain(project, state.aid, nodeId)
        // a mesh inside an assembly input: its track moves it within the
        // assembly, starting from where the assembly placed it
        const part = partForKey(project, nodeId)
        if (part) {
          stage.tracks.push(
            normalizeTrack({ targetKind: 'mesh', nodeId, initPose: part.pose, initLinked: true })!,
          )
          return
        }
        if (!stage.members.some((m) => m.nodeId === nodeId)) {
          stage.members.push({
            nodeId,
            visible: true,
            opacity: 1,
            pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
            color: null,
          })
        }
        const member = stage.members.find((m) => m.nodeId === nodeId)!
        stage.tracks.push(
          normalizeTrack({
            targetKind: 'mesh',
            nodeId,
            initPose: member.pose,
            initLinked: true,
          })!,
        )
      })
    },
    addCameraTrack(currentCameraPose) {
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (!stage) return
        if (!stage.camera) {
          stage.camera = {
            name: DEFAULT_CAMERA_NAME,
            pose: currentCameraPose ?? { pos: { x: 4, y: 3, z: 5 }, rot: { x: 0, y: 0, z: 0 } },
            tracked: true,
          }
        }
        if (!stage.tracks.some((t) => t.targetKind === 'camera')) {
          stage.tracks.push(normalizeTrack({ targetKind: 'camera', initPose: stage.camera.pose })!)
        }
      })
    },
    setCameraName(name) {
      set((state) => {
        const camera = openStage(state)?.stage.camera
        if (camera && name.trim()) camera.name = name.trim()
      })
    },
    importCamera(fromStageId, at) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const source = project
        ? cameraSources(project, aid).find((s) => s.stageId === fromStageId)
        : undefined
      if (!source) return
      const pose = clonePose(at === 'start' ? source.start : source.end)
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (!stage) return
        // a camera made by importing takes the name it came with; one that
        // was already here keeps its own and only starts somewhere else
        if (!stage.camera) stage.camera = { name: source.name, pose, tracked: true }
        else stage.camera.pose = pose
        const track = stage.tracks.find((t) => t.targetKind === 'camera')
        if (track) track.initPose = clonePose(pose)
        else stage.tracks.push(normalizeTrack({ targetKind: 'camera', initPose: pose })!)
        const cam = stage.tracks.find((t) => t.targetKind === 'camera')
        state.worldSelId = ANIM_CAMERA_KEY
        if (cam) state.selection = { trackId: cam.id, actionId: 'init' }
        // show where it starts
        state.playT = 0
        state.playing = false
      })
    },
    importStartPoses(fromStageId, at, only) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      if (!project || !aid) return
      const inScope = (key: string) => !only || key === only || key.startsWith(only + PART_SEP)
      const poses = fromStageId ? importedPoses(project, aid, fromStageId, at, only) : {}
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (!stage) return
        const open = openStage(state)
        if (!open || !state.aid) return
        if (fromStageId) holdStartPoses(open.project, state.aid, poses, true)
        else {
          // back to "as assembled" for the pieces this is about
          for (const key of Object.keys(stage.startPoses)) {
            if (inScope(key)) delete stage.startPoses[key]
          }
        }
        // their tracks start there too, whatever pose they had been given
        const touched = fromStageId ? (key: string) => key in poses : inScope
        for (const track of stage.tracks) {
          if (track.targetKind === 'mesh' && track.nodeId && touched(track.nodeId)) {
            track.initLinked = true
          }
        }
        state.playT = 0
        state.playing = false
      })
    },
    removeTrack(trackId) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const track = project?.stages[aid ?? '']?.tracks.find((t) => t.id === trackId)
      if (!track) return
      if (track.actions.length) {
        set((state) => {
          state.confirm = {
            kind: 'track',
            id: trackId,
            label:
              track.targetKind === 'camera' ? 'Camera' : inputLabel(project ?? null, track.nodeId),
          }
        })
        return
      }
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (stage) stage.tracks = stage.tracks.filter((t) => t.id !== trackId)
        if (state.selection?.trackId === trackId) state.selection = null
      })
    },
    confirmRemoveTrack() {
      const confirm = get().confirm
      if (!confirm || confirm.kind !== 'track') return
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (stage) stage.tracks = stage.tracks.filter((t) => t.id !== confirm.id)
        if (state.selection?.trackId === confirm.id) state.selection = null
        state.confirm = null
      })
    },

    onCamKill() {
      const { pid, aid, projects } = get()
      const stage = projects.find((p) => p.id === pid)?.stages[aid ?? '']
      const camTrack = stage?.tracks.find((t) => t.targetKind === 'camera')
      if (camTrack && camTrack.actions.length) {
        set((state) => {
          state.confirm = {
            kind: 'camera',
            id: camTrack.id,
            label: stage?.camera?.name ?? DEFAULT_CAMERA_NAME,
          }
        })
        return
      }
      get().confirmCamDelete()
    },
    confirmCamDelete() {
      pushHistory()
      set((state) => {
        const stage = openStage(state)?.stage
        if (stage) {
          const cam = stage.tracks.find((t) => t.targetKind === 'camera')
          stage.camera = null
          stage.tracks = stage.tracks.filter((t) => t.targetKind !== 'camera')
          if (cam && state.selection?.trackId === cam.id) state.selection = null
        }
        if (state.worldSelId === ANIM_CAMERA_KEY) state.worldSelId = null
        state.cameraView = false
        state.confirm = null
      })
    },
    cancelCamDelete() {
      set((state) => {
        state.confirm = null
      })
    },

    selectAction(sel) {
      set((state) => {
        state.selection = sel
      })
    },

    addActionAt(trackId, t, toPose) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      const track = project?.stages[aid ?? '']?.tracks.find((x) => x.id === trackId)
      if (!project || !aid || !track) return null
      const slot = freeSlotAt(track, t)
      if (!slot) return null
      const from = poseAtTime(
        effectiveTrack(project, aid, track),
        slot.start,
        trackRest(project, aid, track),
      )
      const action = normalizeAction({
        start: slot.start,
        duration: slot.duration,
        fromPose: from,
        toPose: toPose ?? from,
        fromLinked: true,
        toLinked: false,
        ease: 'easeInOut',
      })!
      pushHistory()
      set((state) => {
        const tr = openStage(state)?.stage.tracks.find((x) => x.id === trackId)
        if (!tr) return
        tr.actions.push(action)
        state.selection = { trackId, actionId: action.id }
      })
      return action.id
    },

    beginEdit() {
      pushHistory()
    },

    updateAction(trackId, actionId, patch) {
      set((state) => {
        const open = openStage(state)
        const track = open?.stage.tracks.find((x) => x.id === trackId)
        const action = track?.actions.find((a) => a.id === actionId)
        if (!open || !track || !action || !state.aid) return
        // unlinking an end keeps it where it currently resolves to, so the
        // motion doesn't jump the moment the link is turned off
        if (patch.fromLinked === false || patch.toLinked === false) {
          const resolved = resolveActions(
            effectiveTrack(open.project, state.aid, track),
            trackRest(open.project, state.aid, track),
          ).find((r) => r.action.id === actionId)
          if (resolved && patch.fromLinked === false && action.fromLinked) {
            action.fromPose = clonePose(resolved.from)
          }
          if (resolved && patch.toLinked === false && action.toLinked) {
            action.toPose = clonePose(resolved.to)
          }
        }
        if (patch.start !== undefined) action.start = Math.max(0, patch.start)
        if (patch.duration !== undefined) action.duration = Math.max(MIN_ACTION_S, patch.duration)
        if (patch.ease) action.ease = patch.ease
        if (patch.fromLinked !== undefined) action.fromLinked = patch.fromLinked
        if (patch.toLinked !== undefined) action.toLinked = patch.toLinked
        if (patch.fromPose) action.fromPose = clonePose(patch.fromPose)
        if (patch.toPose) action.toPose = clonePose(patch.toPose)
      })
    },

    setInitPose(trackId, pose) {
      set((state) => {
        const track = openStage(state)?.stage.tracks.find((x) => x.id === trackId)
        if (!track) return
        // a pose chosen by hand: the track no longer follows the piece
        track.initPose = clonePose(pose)
        track.initLinked = false
      })
    },
    setInitLinked(trackId, linked) {
      set((state) => {
        const open = openStage(state)
        const track = open?.stage.tracks.find((x) => x.id === trackId)
        if (!open || !track || !state.aid || track.targetKind !== 'mesh') return
        // unlinking keeps the pose it was following, so nothing jumps
        if (!linked && track.initLinked) {
          track.initPose = clonePose(effectiveTrack(open.project, state.aid, track).initPose)
        }
        track.initLinked = linked
      })
    },

    duplicateAction(trackId, actionId) {
      const { pid, aid, projects } = get()
      const track = projects
        .find((p) => p.id === pid)
        ?.stages[aid ?? '']?.tracks.find((x) => x.id === trackId)
      const src = track?.actions.find((a) => a.id === actionId)
      if (!track || !src) return
      // right after the original if there's room, else at the track's end
      const slot = freeSlotAt(track, actionEnd(src), src.duration) ?? {
        start: trackDuration(track),
        duration: src.duration,
      }
      const copy = normalizeAction({ ...src, id: undefined, ...slot })!
      pushHistory()
      set((state) => {
        const tr = openStage(state)?.stage.tracks.find((x) => x.id === trackId)
        if (!tr) return
        tr.actions.push(copy)
        state.selection = { trackId, actionId: copy.id }
      })
    },

    deleteAction(trackId, actionId) {
      pushHistory()
      set((state) => {
        const tr = openStage(state)?.stage.tracks.find((x) => x.id === trackId)
        if (tr) tr.actions = tr.actions.filter((a) => a.id !== actionId)
        if (state.selection?.actionId === actionId) state.selection = null
      })
    },

    recordPose(key, pose) {
      const isCam = key === ANIM_CAMERA_KEY
      const findTrack = () =>
        get()
          .projects.find((p) => p.id === get().pid)
          ?.stages[get().aid ?? '']?.tracks.find((t) =>
            isCam ? t.targetKind === 'camera' : t.nodeId === key,
          )
      if (!findTrack()) {
        if (isCam) {
          // a new camera simply starts at the recorded pose
          get().addCameraTrack(pose)
          const cam = findTrack()
          if (cam) get().selectAction({ trackId: cam.id, actionId: 'init' })
          return
        }
        get().addMeshTrack(key)
      }
      const track = findTrack()
      if (!track) return
      const { selection, playT } = get()

      if (selection?.trackId === track.id && selection.actionId === 'init') {
        get().beginEdit()
        get().setInitPose(track.id, pose)
        return
      }
      // which action gets this pose as its end: the selected one on this
      // track, a new one at the playhead, or the one the playhead is inside
      let targetId: string | null = null
      if (selection?.trackId === track.id) {
        targetId = selection.actionId
        get().beginEdit()
        get().updateAction(track.id, targetId, { toPose: pose, toLinked: false })
      } else {
        targetId = get().addActionAt(track.id, playT, pose)
        if (!targetId) {
          const inside = sortedActions(track).find((a) => playT >= a.start && playT < actionEnd(a))
          if (!inside) return
          targetId = inside.id
          get().beginEdit()
          get().updateAction(track.id, targetId, { toPose: pose, toLinked: false })
        }
      }
      // park the playhead at that action's end, so the viewport keeps
      // showing the pose just recorded (and the next one chains from it)
      const id = targetId
      set((state) => {
        const a = openStage(state)
          ?.stage.tracks.find((x) => x.id === track.id)
          ?.actions.find((x) => x.id === id)
        if (!a) return
        state.selection = { trackId: track.id, actionId: id }
        state.playT = actionEnd(a)
        state.playing = false
      })
    },
  }
  return actions
}
