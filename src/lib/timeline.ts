// Animation evaluation over the plain track/action data persisted by the
// store — pose-at-time with chained actions and easing, durations, and the
// pure geometry the timeline UI needs (clamping drags so actions never
// overlap, snapping, ruler ticks). No DOM; three.js is used for its math
// only (tweenPoses slerps rotations).
import * as THREE from 'three'

import { clamp } from './utils'
import type { Ease, Pose, Stage, TimelineAction, Track } from '@/types/project'

/** Shortest action the timeline allows, in seconds. */
export const MIN_ACTION_S = 0.1

const EASE_FN: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t * t * (3 - 2 * t),
}

export function easeValue(ease: Ease | undefined, t: number): number {
  return (EASE_FN[ease ?? 'easeInOut'] ?? EASE_FN.easeInOut)(clamp(t, 0, 1))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Per-component blend of two poses at an already-eased `u`. Rotations
 *  blend as Euler degrees on purpose: an authored 0° → 720° turn spins
 *  twice, which a shortest-path slerp would flatten to no motion. */
export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  return {
    pos: {
      x: lerp(a.pos.x, b.pos.x, u),
      y: lerp(a.pos.y, b.pos.y, u),
      z: lerp(a.pos.z, b.pos.z, u),
    },
    rot: {
      x: lerp(a.rot.x, b.rot.x, u),
      y: lerp(a.rot.y, b.rot.y, u),
      z: lerp(a.rot.z, b.rot.z, u),
    },
  }
}

function quatOf(p: Pose): THREE.Quaternion {
  const r = THREE.MathUtils.degToRad
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(r(p.rot.x), r(p.rot.y), r(p.rot.z), 'XYZ'),
  )
}

/** Blend from an arbitrary pose (wherever a user left a piece) to another
 *  along the shortest rotation — for transitions, not authored motion. */
export function tweenPoses(from: Pose, to: Pose, u: number): Pose {
  if (u <= 0) return from
  if (u >= 1) return to
  const q = quatOf(from).slerp(quatOf(to), u)
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const d = THREE.MathUtils.radToDeg
  return {
    pos: lerpPose(from, to, u).pos,
    rot: { x: d(e.x), y: d(e.y), z: d(e.z) },
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

export interface ResolvedAction {
  action: TimelineAction
  from: Pose
  to: Pose
}

/** Each action with its effective endpoints: a linked start is wherever
 *  the track was when the action begins (previous end, or the initial
 *  pose); a linked end is the piece's connector pose (`rest`, when known).
 *  Resolved at evaluation time so links never go stale. */
export function resolveActions(track: Track, rest: Pose | null): ResolvedAction[] {
  let current = track.initPose
  return sortedActions(track).map((action) => {
    const from = action.fromLinked ? current : action.fromPose
    const to = action.toLinked && rest ? rest : action.toPose
    current = to
    return { action, from, to }
  })
}

/** The pose a single track holds at time `t` (seconds). */
export function poseAtTime(track: Track, t: number, rest: Pose | null = null): Pose {
  let pose = track.initPose
  for (const { action, from, to } of resolveActions(track, rest)) {
    if (t < action.start) break
    if (t >= actionEnd(action)) {
      pose = to
      continue
    }
    const u = action.duration > 0 ? (t - action.start) / action.duration : 1
    return lerpPose(from, to, easeValue(action.ease, u))
  }
  return pose
}

export interface StageEval {
  meshes: Record<string, Pose>
  camera: Pose | null
}

/** Every track's pose at `t`, keyed by target — meshes by node id / part
 *  key, the camera under `camera`. `restPoseOf` resolves connector poses
 *  for actions that end "at the connector". */
export function evalStage(
  stage: Stage,
  t: number,
  restPoseOf: (key: string) => Pose | null = () => null,
): StageEval {
  const meshes: Record<string, Pose> = {}
  let camera: Pose | null = null
  for (const track of stage.tracks) {
    if (track.targetKind === 'camera') camera = poseAtTime(track, t)
    else if (track.targetKind === 'mesh' && track.nodeId) {
      meshes[track.nodeId] = poseAtTime(track, t, restPoseOf(track.nodeId))
    }
  }
  return { meshes, camera }
}

// ---------- timeline editing geometry ----------

/** The free span an action may occupy: from the end of the action before
 *  it to the start of the one after it (same track, by start time). */
function freeSpan(track: Track, actionId: string): { min: number; max: number } {
  const others = sortedActions(track)
  const i = others.findIndex((a) => a.id === actionId)
  const prev = i > 0 ? others[i - 1] : null
  const next = i >= 0 && i < others.length - 1 ? others[i + 1] : null
  return { min: prev ? actionEnd(prev) : 0, max: next ? next.start : Infinity }
}

/** Where an action dragged to `start` may actually go: same length, never
 *  overlapping its neighbours, never before 0. */
export function clampActionMove(track: Track, actionId: string, start: number): number {
  const action = track.actions.find((a) => a.id === actionId)
  if (!action) return start
  const { min, max } = freeSpan(track, actionId)
  const hi = max - action.duration
  if (hi < min) return action.start
  return clamp(start, min, hi)
}

/** Dragging one edge of an action to `t`: the other edge stays put. */
export function clampActionResize(
  track: Track,
  actionId: string,
  edge: 'start' | 'end',
  t: number,
): { start: number; duration: number } {
  const action = track.actions.find((a) => a.id === actionId)
  if (!action) return { start: t, duration: MIN_ACTION_S }
  const { min, max } = freeSpan(track, actionId)
  const end = actionEnd(action)
  if (edge === 'end') {
    const newEnd = clamp(t, action.start + MIN_ACTION_S, max)
    return { start: action.start, duration: newEnd - action.start }
  }
  const newStart = clamp(t, min, end - MIN_ACTION_S)
  return { start: newStart, duration: end - newStart }
}

/** Room for a new action starting at `t`: `preferred` seconds long, or
 *  shorter to fit before the next action; null if `t` is inside one or
 *  the gap is too small. */
export function freeSlotAt(
  track: Track,
  t: number,
  preferred = 1,
): { start: number; duration: number } | null {
  const start = Math.max(0, t)
  const actions = sortedActions(track)
  if (actions.some((a) => start >= a.start - 1e-6 && start < actionEnd(a) - 1e-6)) return null
  const next = actions.find((a) => a.start >= start)
  const duration = Math.min(preferred, next ? next.start - start : preferred)
  return duration >= MIN_ACTION_S - 1e-9 ? { start, duration } : null
}

/** Snaps `t` to the closest target within `threshold` (action edges, the
 *  playhead…), else to the `grid` step if one is given. */
export function snapTime(
  t: number,
  opts: { targets?: number[]; threshold?: number; grid?: number },
): number {
  const threshold = opts.threshold ?? 0
  let best = t
  let bestDist = threshold
  for (const target of opts.targets ?? []) {
    const d = Math.abs(target - t)
    if (d <= bestDist) {
      bestDist = d
      best = target
    }
  }
  if (best !== t) return best
  return opts.grid ? Math.round(t / opts.grid) * opts.grid : t
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
  label: string | null
}

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60]

/** Ruler ticks across `duration` at the current zoom: the smallest step
 *  that keeps ticks ≥ ~12px apart, labelled every few ticks (a multiple
 *  of that step, so labels land on ticks) staying ≥ ~56px apart. */
export function ticks(duration: number, pxPerSecond: number): Tick[] {
  const minor = TICK_STEPS.find((s) => s * pxPerSecond >= 12) ?? 60
  const isMultiple = (s: number) => Math.abs(s / minor - Math.round(s / minor)) < 1e-9
  const major = TICK_STEPS.find((s) => s >= minor && isMultiple(s) && s * pxPerSecond >= 56) ?? 60
  const out: Tick[] = []
  const count = Math.ceil(duration / minor)
  for (let i = 0; i <= count; i++) {
    const t = Math.round(i * minor * 1000) / 1000
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
    out.push({ t, x: t * pxPerSecond, label: isMajor ? `${+t.toFixed(2)}s` : null })
  }
  return out
}
