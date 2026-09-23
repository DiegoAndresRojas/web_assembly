// Animation evaluation over the plain track/action data persisted by the
// store: duration, pose-at-time, snapping and small formatting helpers.
// Pure — no three.js and no DOM. Typed port of
// only_js/src/composables/useTimeline.js.
import { clamp } from './utils'
import type { Pose, Stage, TimelineAction, Track } from '@/types/project'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const e = ease(clamp(t, 0, 1))
  return {
    pos: {
      x: lerp(a.pos.x, b.pos.x, e),
      y: lerp(a.pos.y, b.pos.y, e),
      z: lerp(a.pos.z, b.pos.z, e),
    },
    rot: {
      x: lerp(a.rot.x, b.rot.x, e),
      y: lerp(a.rot.y, b.rot.y, e),
      z: lerp(a.rot.z, b.rot.z, e),
    },
  }
}

export function actionEnd(action: TimelineAction): number {
  return action.start + action.duration
}

export function sortedActions(track: Track): TimelineAction[] {
  return track.actions.slice().sort((a, b) => a.start - b.start)
}

export function trackDuration(track: Track): number {
  return track.actions.reduce((max, a) => Math.max(max, actionEnd(a)), 0)
}

export function stageDuration(stage: Stage): number {
  return stage.tracks.reduce((max, t) => Math.max(max, trackDuration(t)), 0)
}

/** The pose a single track holds at time `t` (seconds). */
export function poseAtTime(track: Track, t: number): Pose {
  const actions = sortedActions(track)
  let pose = track.initPose
  for (const a of actions) {
    if (t < a.start) break
    if (t >= actionEnd(a)) {
      pose = a.toPose
      continue
    }
    const progress = a.duration > 0 ? (t - a.start) / a.duration : 1
    return lerpPose(a.fromPose, a.toPose, progress)
  }
  return pose
}

export interface StageEval {
  meshes: Record<string, Pose>
  camera: Pose | null
}

/** Every track's pose at `t`, keyed by target — meshes by board node id,
 *  the camera under `camera`. */
export function evalStage(stage: Stage, t: number): StageEval {
  const meshes: Record<string, Pose> = {}
  let camera: Pose | null = null
  for (const track of stage.tracks) {
    const pose = poseAtTime(track, t)
    if (track.targetKind === 'camera') camera = pose
    else if (track.nodeId) meshes[track.nodeId] = pose
  }
  return { meshes, camera }
}

export function snapSeconds(t: number, step = 0.1): number {
  return Math.round(t / step) * step
}

/** Sensible defaults for a new action appended to a track: start right
 *  after whatever's already there, one second long, continuing from the
 *  track's current end pose. */
export function nextActionDefaults(track: Track): {
  start: number
  duration: number
  fromPose: Pose
  toPose: Pose
} {
  const start = trackDuration(track)
  const from = start > 0 ? poseAtTime(track, start) : track.initPose
  return { start, duration: 1, fromPose: from, toPose: from }
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rem = (s - m * 60).toFixed(1)
  return m + ':' + (Number(rem) < 10 ? '0' : '') + rem
}

export interface Tick {
  t: number
  x: number
  label: string
}

/** Ruler ticks for the lane header, one per second across `duration`. */
export function ticks(duration: number, pxPerSecond: number): Tick[] {
  const count = Math.max(1, Math.ceil(duration)) + 1
  const out: Tick[] = []
  for (let i = 0; i < count; i++) {
    out.push({ t: i, x: i * pxPerSecond, label: i + 's' })
  }
  return out
}
