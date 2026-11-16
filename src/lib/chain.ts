// Where the pieces of an animation stage start, across a chain of
// assemblies (Assembly 1 → Assembly 2 → …, each of which may feed an
// animation of its own).
//
// An animation only takes inputs. A piece starts where its assembly put it
// unless the animation holds a start pose for it (stage.startPoses). Those
// are written at two moments, never recomputed behind the author's back:
//   - when an assembly is first wired into the animation, from the last
//     animation in the chain that covers each piece (chainStartPoses);
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

/** Where animation `stageId` has piece `key` when it starts or ends. */
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
 *  inputs and, for assembly inputs, every piece inside them. */
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
    else if (track.nodeId) {
      meshes[track.nodeId] = poseAtTime(
        effectiveTrack(project, stageId, track),
        t,
        restPoseOf(project, stageId, track.nodeId),
      )
    }
  }
  return { meshes, camera }
}

// ---------- start poses from the chain ----------

/** An animation that plays assembly `asmId` (fed by it on the board) and
 *  actually moves something. */
function animationOf(project: Project, asmId: string): string | null {
  for (const edge of project.board.edges) {
    if (edge.from !== asmId) continue
    const stage = project.stages[edge.to]
    if (stage?.kind === 'animation' && stageDuration(stage) > 0) return edge.to
  }
  return null
}

/** The pose the animations of the assemblies below `holder` leave a piece
 *  in. `path` leads from `holder` down to the piece: the assembly input
 *  holding it first. Null when none of them covers it. */
function inherited(project: Project, holder: string, path: string[]): Pose | null {
  if (path.length < 2) return null
  const [asmId, ...inner] = path
  // `holder` was assembled after those animations: where it re-placed a
  // piece of its input stands
  if (inner.length === 1 && project.stages[holder]?.partOverrides?.[path.join(PART_SEP)]) {
    return null
  }
  const animation = animationOf(project, asmId)
  if (animation) return poseIn(project, animation, path.join(PART_SEP), 'end')
  return inherited(project, asmId, inner)
}

/** The start poses assembly input `asmId` brings into an animation the
 *  first time it is wired in: each piece mounted in an earlier assembly
 *  where the last animation in the chain that covers it left it. Pieces no
 *  animation has touched are left out (they start as assembled). */
export function chainStartPoses(project: Project, asmId: string): Record<string, Pose> {
  const poses: Record<string, Pose> = {}
  for (const part of assemblyParts(project, asmId)) {
    const [input, ...path] = part.key.split(PART_SEP)
    const pose = inherited(project, input, path)
    if (pose) poses[part.key] = pose
  }
  return poses
}

// ---------- start poses imported from another animation ----------

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
 *  An assembly is only ever matched the first way — a later assembly's
 *  placement of an earlier one is not something another animation undoes. */
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
  // two segments or more in common: the same piece held by the same thing
  if (best.shared >= 2) return { key: best.key, same: true }
  const leaf = project.board.nodes.find((n) => n.id === segs[segs.length - 1])
  return leaf?.kind === 'mesh' ? { key: best.key, same: false } : null
}

/** The keys from an animation's input down to `key`: `a`, `a/b`, `a/b/c`. */
function pathKeys(key: string): string[] {
  const segs = key.split(PART_SEP)
  return segs.map((_, i) => segs.slice(0, i + 1).join(PART_SEP))
}

/** Where a piece is in an animation's world: every pose from its input
 *  down to it, combined. */
function worldPose(keys: string[], poseOf: (key: string) => Pose | null): Pose {
  return keys.reduce((world, key) => composePoses(world, poseOf(key) ?? IDENTITY), IDENTITY)
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
  const poses: Record<string, Pose> = {}
  // parents first, so a piece is placed relative to where its parent ends up
  const startOf = (key: string) => poses[key] ?? startPoseOf(project, stageId, key)
  for (const { key } of stagePieces(project, stageId)) {
    if (only && key !== only && !key.startsWith(only + PART_SEP)) continue
    const match = matchIn(project, theirs, key)
    if (!match) continue
    const their = (k: string) => poseIn(project, fromStageId, k, at)
    let pose: Pose | null
    if (match.same) pose = their(match.key)
    else {
      // same place in the world as over there, expressed in what holds it here
      const parent = worldPose(pathKeys(key).slice(0, -1), startOf)
      pose = relativePose(parent, worldPose(pathKeys(match.key), their))
    }
    if (pose) poses[key] = pose
  }
  return poses
}

function samePose(a: Pose, b: Pose): boolean {
  const eps = 1e-4
  return (['pos', 'rot'] as const).every((k) =>
    (['x', 'y', 'z'] as const).every((axis) => Math.abs(a[k][axis] - b[k][axis]) < eps),
  )
}

/** How many of `poses` would actually move their piece from where it
 *  starts in `stageId` now. */
export function movedBy(project: Project, stageId: string, poses: Record<string, Pose>): number {
  return Object.entries(poses).filter(([key, pose]) => {
    const now = startPoseOf(project, stageId, key)
    return !now || !samePose(now, pose)
  }).length
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
