// Where the pieces of an animation stage start, across a chain of
// assemblies (Assembly 1 → Assembly 2 → …, each of which may feed an
// animation of its own).
//
// A piece mounted in an earlier assembly starts where the last animation
// in the chain that covers it left it; a piece no animation has touched
// starts where its assembly put it. Nothing here is copied into the stage:
// it is worked out from the board each time, so it never goes stale when
// an assembly or an earlier animation changes.
import { assemblyParts, membersOf, PART_SEP, restPoseOf } from './graph'
import { poseAtTime, stageDuration, type StageEval } from './timeline'
import type { Pose, Project, Track } from '@/types/project'

const IDENTITY: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

/** Results per project object — the store never mutates one in place
 *  (immer), and playback asks for these every frame. */
const cache = new WeakMap<Project, Map<string, Pose | null>>()

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

/** Where animation `stageId` leaves piece `key` when it ends. */
function endPoseIn(project: Project, stageId: string, key: string): Pose | null {
  const stage = project.stages[stageId]
  const track = stage?.tracks.find((t) => t.targetKind === 'mesh' && t.nodeId === key)
  if (!stage || !track) return startPoseOf(project, stageId, key)
  return poseAtTime(
    effectiveTrack(project, stageId, track),
    stageDuration(stage),
    restPoseOf(project, stageId, key),
  )
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
  if (animation) return endPoseIn(project, animation, path.join(PART_SEP))
  return inherited(project, asmId, inner)
}

/** Where piece `key` of stage `stageId` is before the stage's own
 *  animation moves it: for a piece mounted in an earlier assembly, where
 *  the last animation in the chain left it; otherwise (and for the
 *  stage's inputs themselves) its connector pose. */
export function startPoseOf(project: Project, stageId: string, key: string): Pose | null {
  let byKey = cache.get(project)
  if (!byKey) cache.set(project, (byKey = new Map()))
  const id = stageId + '|' + key
  if (byKey.has(id)) return byKey.get(id) ?? null
  const [input, ...path] = key.split(PART_SEP)
  const pose = inherited(project, input, path) ?? restPoseOf(project, stageId, key)
  byKey.set(id, pose)
  return pose
}

/** A track as it plays: one that starts "where the piece is" (initLinked)
 *  gets that start pose in place of its stored one. */
export function effectiveTrack(project: Project, stageId: string, track: Track): Track {
  if (!track.initLinked || track.targetKind !== 'mesh' || !track.nodeId) return track
  const start = startPoseOf(project, stageId, track.nodeId)
  return start ? { ...track, initPose: start } : track
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
    const self = { key: row.node.id, start: member?.pose ?? IDENTITY }
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
