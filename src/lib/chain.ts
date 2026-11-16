// Where the pieces of an animation stage start, across a chain of
// assemblies (Assembly 1 → Assembly 2 → …, each of which may feed an
// animation of its own).
//
// An animation only takes inputs. A piece starts where its assembly put it
// unless the animation holds a start pose for it (stage.startPoses). Those
// are written at set moments, never recomputed behind the author's back:
//   - when an assembly is wired into the animation, and when one of its
//     pieces (or the assembly itself) is put on the timeline: from the
//     last animation earlier in the chain (recoverFromChain);
//   - when the author imports positions from another animation
//     (importedPoses).
import { assemblyParts, membersOf, PART_SEP, restPoseOf } from './graph'
import { composePoses, relativePose } from './rigid'
import { poseAtTime, stageDuration, type StageEval } from './timeline'
import type { Pose, Project, Track } from '@/types/project'

const IDENTITY: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

/** Where piece `key` of stage `stageId` is before the stage's own
 *  animation moves it: the start pose the stage holds for it, or else its
 *  connector pose. */
export function startPoseOf(project: Project, stageId: string, key: string): Pose | null {
  return project.stages[stageId]?.startPoses?.[key] ?? restPoseOf(project, stageId, key)
}

/** A track as it plays: one that starts "where the piece is" (initLinked)
 *  gets that start pose in place of its stored one. */
export function effectiveTrack(project: Project, stageId: string, track: Track): Track {
  if (!track.initLinked || track.targetKind !== 'mesh' || !track.nodeId) return track
  const start = startPoseOf(project, stageId, track.nodeId)
  return start ? { ...track, initPose: start } : track
}

/** Where animation `stageId` has piece `key` when it starts or ends. An
 *  animation that only sets where a piece starts (a track with no actions)
 *  has it there at the end too. */
export function poseIn(
  project: Project,
  stageId: string,
  key: string,
  at: 'start' | 'end',
): Pose | null {
  const stage = project.stages[stageId]
  const track = stage?.tracks.find((t) => t.targetKind === 'mesh' && t.nodeId === key)
  if (!stage || !track) return startPoseOf(project, stageId, key)
  return poseAtTime(
    effectiveTrack(project, stageId, track),
    at === 'end' ? stageDuration(stage) : 0,
    restPoseOf(project, stageId, key),
  )
}

/** Every piece of a stage's scene with the pose it starts in: the stage's
 *  inputs and, for assembly inputs, every piece inside them — an input
 *  first, then what it holds. */
export function stagePieces(
  project: Project,
  stageId: string,
): Array<{ key: string; start: Pose }> {
  const stage = project.stages[stageId]
  return membersOf(project, stageId).flatMap((row) => {
    // a stage never opened has no member records yet: default pose
    const member = stage?.members.find((m) => m.nodeId === row.node.id)
    const self = {
      key: row.node.id,
      start: stage?.startPoses?.[row.node.id] ?? member?.pose ?? IDENTITY,
    }
    if (row.mesh) return [self]
    return [
      self,
      ...assemblyParts(project, row.node.id).map((part) => ({
        key: part.key,
        start: startPoseOf(project, stageId, part.key) ?? part.pose,
      })),
    ]
  })
}

/** Every track's pose at `t` (see timeline.evalStage), with linked starts
 *  and connector poses resolved against the project. */
export function evalStageIn(project: Project, stageId: string, t: number): StageEval {
  const stage = project.stages[stageId]
  const meshes: Record<string, Pose> = {}
  let camera: Pose | null = null
  for (const track of stage?.tracks ?? []) {
    if (track.targetKind === 'camera') camera = poseAtTime(track, t)
    // (lights are evaluated on their own: lib/lights.ts)
    else if (track.targetKind === 'mesh' && track.nodeId) {
      meshes[track.nodeId] = poseAtTime(
        effectiveTrack(project, stageId, track),
        t,
        restPoseOf(project, stageId, track.nodeId),
      )
    }
  }
  return { meshes, camera }
}

// ---------- poses taken from another animation ----------

const lastSeg = (key: string) => key.slice(key.lastIndexOf(PART_SEP) + 1)

function samePose(a: Pose, b: Pose): boolean {
  const eps = 1e-4
  return (['pos', 'rot'] as const).every((k) =>
    (['x', 'y', 'z'] as const).every((axis) => Math.abs(a[k][axis] - b[k][axis]) < eps),
  )
}

/** How many trailing segments two keys have in common. */
function sharedTail(a: string[], b: string[]): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/** The piece of the other animation that `key` is, and how it relates:
 *
 *  - `same`: what holds the piece is the same there (the very same key, or
 *    the other animation plays an assembly that is nested deeper here), so
 *    the piece's pose can be taken as it is;
 *  - otherwise only the piece itself is the same board node, reached
 *    through different assemblies (a duplicated assembly, a mesh wired
 *    into two of them, …): its pose has to go through world space.
 *
 *  An assembly is only ever matched the first way: where a later assembly
 *  placed an earlier one inside itself is that assembly's business. (The
 *  whole of it moves instead — see `alignedInput`.) */
function matchIn(
  project: Project,
  theirKeys: string[],
  key: string,
): { key: string; same: boolean } | null {
  if (theirKeys.includes(key)) return { key, same: true }
  const segs = key.split(PART_SEP)
  let best: { key: string; shared: number } | null = null
  for (const their of theirKeys) {
    const shared = sharedTail(segs, their.split(PART_SEP))
    if (shared && (!best || shared > best.shared)) best = { key: their, shared }
  }
  if (!best) return null
  if (best.shared >= 2) {
    // …unless the assembly holding it here put that piece somewhere else
    // since: that placement stands
    const [holder, asm, piece] = segs.slice(-3)
    const replaced =
      segs.length >= 3 && project.stages[holder]?.partOverrides?.[asm + PART_SEP + piece]
    return replaced ? null : { key: best.key, same: true }
  }
  const leaf = project.board.nodes.find((n) => n.id === lastSeg(key))
  return leaf?.kind === 'mesh' ? { key: best.key, same: false } : null
}

/** The keys from an animation's input down to `key`: `a`, `a/b`, `a/b/c`. */
function pathKeys(key: string): string[] {
  const segs = key.split(PART_SEP)
  return segs.map((_, i) => segs.slice(0, i + 1).join(PART_SEP))
}

/** Every pose along `keys`, combined: where the last of them is in the
 *  space the first one is posed in. */
function combined(keys: string[], poseOf: (key: string) => Pose | null): Pose {
  return keys.reduce((world, key) => composePoses(world, poseOf(key) ?? IDENTITY), IDENTITY)
}

/** Where assembly input `key` of this animation has to be so that the
 *  assembly the other animation plays — which a later assembly holds
 *  somewhere inside this one — is at the same place in the world as it is
 *  over there. Null when this input does not contain one of the other
 *  animation's inputs. */
function alignedInput(
  project: Project,
  ourKeys: string[],
  theirKeys: string[],
  key: string,
  startOf: (key: string) => Pose | null,
  their: (key: string) => Pose | null,
): Pose | null {
  const isAssembly = (id: string) =>
    project.board.nodes.find((n) => n.id === id)?.kind === 'assembly'
  const theirInputs = theirKeys.filter((k) => !k.includes(PART_SEP) && isAssembly(k))
  // the shallowest one, should it be nested here more than once
  const inside = ourKeys
    .filter((k) => k.startsWith(key + PART_SEP) && theirInputs.includes(lastSeg(k)))
    .sort((a, b) => a.split(PART_SEP).length - b.split(PART_SEP).length)[0]
  if (!inside) return null
  const there = their(lastSeg(inside))
  if (!there) return null
  // where this input's own assembly chain puts that assembly, undone
  const below = combined(pathKeys(inside).slice(1), startOf)
  return composePoses(there, relativePose(below, IDENTITY))
}

/** The start poses animation `stageId` would take from animation
 *  `fromStageId`: every piece the two have in common, where the other one
 *  has it when it starts or ends. `only` narrows it to one piece and what
 *  is inside it. */
export function importedPoses(
  project: Project,
  stageId: string,
  fromStageId: string,
  at: 'start' | 'end',
  only: string | null = null,
): Record<string, Pose> {
  const theirs = stagePieces(project, fromStageId).map((p) => p.key)
  const ours = stagePieces(project, stageId).map((p) => p.key)
  const their = (k: string) => poseIn(project, fromStageId, k, at)
  const poses: Record<string, Pose> = {}
  // (inputs come before what they hold, so a piece is placed relative to
  // where what holds it ends up)
  const startOf = (key: string) => poses[key] ?? startPoseOf(project, stageId, key)
  for (const key of ours) {
    if (only && key !== only && !key.startsWith(only + PART_SEP)) continue
    const match = matchIn(project, theirs, key)
    let pose: Pose | null = null
    if (match?.same) pose = their(match.key)
    else if (match) {
      // same place in the world as over there, expressed in what holds it here
      const parent = combined(pathKeys(key).slice(0, -1), startOf)
      pose = relativePose(parent, combined(pathKeys(match.key), their))
    } else if (!key.includes(PART_SEP)) {
      pose = alignedInput(project, ours, theirs, key, startOf, their)
    }
    if (pose) poses[key] = pose
  }
  return poses
}

/** How many of `poses` would actually move their piece from where it
 *  starts in `stageId` now. */
export function movedBy(project: Project, stageId: string, poses: Record<string, Pose>): number {
  return Object.entries(poses).filter(([key, pose]) => {
    const now = startPoseOf(project, stageId, key)
    return !now || !samePose(now, pose)
  }).length
}

/** Makes animation `stageId` hold `poses` as where those pieces start.
 *  Mutates the project (an immer draft in the store). A pose that is just
 *  where the assembly has the piece is not held at all, so the piece keeps
 *  following its assembly. Without `overwrite`, a piece the animation
 *  already holds a start pose for keeps it. */
export function holdStartPoses(
  project: Project,
  stageId: string,
  poses: Record<string, Pose>,
  overwrite: boolean,
): void {
  const stage = project.stages[stageId]
  if (!stage) return
  for (const [key, pose] of Object.entries(poses)) {
    if (!overwrite && key in stage.startPoses) continue
    const rest = restPoseOf(project, stageId, key) ?? IDENTITY
    if (samePose(pose, rest)) delete stage.startPoses[key]
    else stage.startPoses[key] = { pos: { ...pose.pos }, rot: { ...pose.rot } }
  }
}

// ---------- the chain ----------

/** Whether an animation says anything about where pieces are: a track
 *  (even one that only sets where its piece starts) or a held start pose. */
function saysSomething(project: Project, stageId: string): boolean {
  const stage = project.stages[stageId]
  return (
    stage?.kind === 'animation' &&
    (stage.tracks.some((t) => t.targetKind === 'mesh') || Object.keys(stage.startPoses).length > 0)
  )
}

/** The animations before `stageId` in its chain of assemblies, nearest
 *  first: those of the assemblies feeding the ones this animation plays —
 *  its own assemblies' inputs first, then theirs, and so on back. */
export function earlierAnimations(project: Project, stageId: string): string[] {
  const kindOf = (id: string) => project.board.nodes.find((n) => n.id === id)?.kind
  const feeding = (id: string) =>
    project.board.edges
      .filter((e) => e.to === id)
      .map((e) => e.from)
      .filter((from) => kindOf(from) === 'assembly')
  const found: string[] = []
  const seen = new Set<string>()
  let level = feeding(stageId)
  while (level.length) {
    const next: string[] = []
    for (const asm of level) {
      for (const earlier of feeding(asm)) {
        if (seen.has(earlier)) continue
        seen.add(earlier)
        for (const e of project.board.edges) {
          if (e.from !== earlier || e.to === stageId || kindOf(e.to) !== 'animation') continue
          if (!found.includes(e.to)) found.push(e.to)
        }
        next.push(earlier)
      }
    }
    level = next
  }
  return found
}

/** The last animation before `stageId` in its chain of assemblies that
 *  says anything about where pieces are. Null at the start of a chain. */
export function previousAnimation(project: Project, stageId: string): string | null {
  return earlierAnimations(project, stageId).find((id) => saysSomething(project, id)) ?? null
}

/** Has animation `stageId` take up where the last animation before it in
 *  the chain left off: its pieces start where that one ends. `only` keeps
 *  it to one piece and what is inside it. Never replaces a start pose the
 *  animation already holds. Mutates the project (an immer draft). */
export function recoverFromChain(project: Project, stageId: string, only: string | null): void {
  const previous = previousAnimation(project, stageId)
  if (!previous) return
  holdStartPoses(project, stageId, importedPoses(project, stageId, previous, 'end', only), false)
}

export interface PoseSource {
  stageId: string
  /** How many pieces of the open animation it has a pose for. */
  pieces: number
}

/** The other animations that share pieces with `stageId`, in board order. */
export function poseSources(project: Project, stageId: string): PoseSource[] {
  return project.board.nodes.flatMap((node) => {
    if (node.kind !== 'animation' || node.id === stageId) return []
    const pieces = Object.keys(importedPoses(project, stageId, node.id, 'end')).length
    return pieces ? [{ stageId: node.id, pieces }] : []
  })
}
