// The assembly engine over plain stage data: which things move on their
// own in a stage ("bodies"), how keypoint links tie them together, and how
// a piece is unlocked from / locked back into an assembly input. Mutates
// the stage it is given, so it works on an immer draft and on a plain
// object alike.
import * as THREE from 'three'

import { PART_SEP } from './graph'
import { solveAxisAlign, vec } from './keypoints'
import {
  composePoses,
  deltaBetween,
  moveDirection,
  movePoint,
  movePose,
  relativePose,
} from './rigid'
import type { Axis, KeypointLink, Pose, Stage } from '@/types/project'

const IDENTITY: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

const WORLD_AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

const clonePose = (p: Pose): Pose => ({ pos: { ...p.pos }, rot: { ...p.rot } })

// ---------- bodies ----------

/** The pose of a body — a stage input, or a piece released from an
 *  assembly input (by part key) — or null if `id` is not one. */
export function bodyPose(stage: Stage, id: string): Pose | null {
  const member = stage.members.find((m) => m.nodeId === id)
  if (member) return member.pose
  const override = stage.partOverrides[id]
  return override?.free ? override.pose : null
}

function setBodyPose(stage: Stage, id: string, pose: Pose): void {
  const member = stage.members.find((m) => m.nodeId === id)
  if (member) member.pose = clonePose(pose)
  else if (stage.partOverrides[id]?.free) stage.partOverrides[id].pose = clonePose(pose)
}

/** Every body tied to `id` through keypoint links, directly or through
 *  other bodies — not including `id` itself. */
export function linkedBodies(links: KeypointLink[], id: string): string[] {
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    const current = queue.pop()!
    for (const link of links) {
      const other = link.nodeA === current ? link.nodeB : link.nodeB === current ? link.nodeA : null
      if (other && !seen.has(other)) {
        seen.add(other)
        queue.push(other)
      }
    }
  }
  seen.delete(id)
  return [...seen]
}

/** Carries the bodies `ids` through the rigid motion `delta`, along with
 *  the keypoints picked on them (stored in the stage's space). */
function moveBodies(stage: Stage, ids: string[], delta: THREE.Matrix4): void {
  const moved = new Set(ids)
  for (const id of moved) {
    const pose = bodyPose(stage, id)
    if (pose) setBodyPose(stage, id, movePose(delta, pose))
  }
  for (const link of stage.links) {
    if (moved.has(link.nodeA)) {
      link.pointA = movePoint(delta, link.pointA)
      link.normalA = moveDirection(delta, link.normalA)
    }
    if (moved.has(link.nodeB)) {
      link.pointB = movePoint(delta, link.pointB)
      link.normalB = moveDirection(delta, link.normalB)
    }
  }
}

/** Puts body `id` at `pose` (a gizmo drag): everything linked to it goes
 *  along, as one rigid whole. */
export function moveBodyTo(stage: Stage, id: string, pose: Pose): void {
  const from = bodyPose(stage, id)
  if (!from) return
  moveBodies(stage, [id, ...linkedBodies(stage.links, id)], deltaBetween(from, pose))
  // exactly what the user left, not the round trip through a matrix
  setBodyPose(stage, id, pose)
}

// ---------- keypoint links ----------

/** Solves a link that was just added to `stage.links`: turns B about the
 *  link's world axis so its keypoint normal faces A's, then slides it so
 *  the two keypoints meet. Whatever was already linked to B comes along.
 *  When no turn about that axis can face the normals (one of them runs
 *  along it), B is only slid, so the points still meet. */
export function solveLink(stage: Stage, link: KeypointLink): void {
  if (!bodyPose(stage, link.nodeA) || !bodyPose(stage, link.nodeB)) {
    link.state = 'gap'
    link.gap = vec.distance(link.pointA, link.pointB)
    return
  }
  const deg = solveAxisAlign(link.axis, link.normalB, link.normalA) ?? 0
  const { pointA: a, pointB: b } = link
  const delta = new THREE.Matrix4()
    .makeTranslation(a.x, a.y, a.z)
    .multiply(
      new THREE.Matrix4().makeRotationAxis(WORLD_AXES[link.axis], THREE.MathUtils.degToRad(deg)),
    )
    .multiply(new THREE.Matrix4().makeTranslation(-b.x, -b.y, -b.z))

  const others = stage.links.filter((l) => l !== link && l.id !== link.id)
  const withB = linkedBodies(others, link.nodeB)
  // already tied to A some other way: B cannot bring that group along
  const moving = withB.includes(link.nodeA) ? [link.nodeB] : [link.nodeB, ...withB]
  moveBodies(stage, moving, delta)
  link.state = 'solved'
  link.gap = 0
}

// ---------- unlocking pieces of an assembly input ----------

function asmPoseOf(stage: Stage, partKey: string): Pose {
  const asmId = partKey.split(PART_SEP)[0]
  return stage.members.find((m) => m.nodeId === asmId)?.pose ?? IDENTITY
}

/** Whether `key` is a piece currently released from its assembly. */
export function isFreePart(stage: Stage, key: string): boolean {
  return stage.partOverrides[key]?.free === true
}

/** Releases a piece from its assembly input: it stays where it is, as a
 *  body of its own. `assembled` is the pose the assembly gave it. */
export function releasePart(stage: Stage, key: string, assembled: Pose): void {
  const current = stage.partOverrides[key]
  if (current?.free) return
  const local = current ? current.pose : assembled
  stage.partOverrides[key] = { free: true, pose: composePoses(asmPoseOf(stage, key), local) }
}

/** Locks a released piece back into its assembly where it is now. Links
 *  made on the piece carry over to the assembly it is part of again. */
export function lockPart(stage: Stage, key: string): void {
  const current = stage.partOverrides[key]
  if (!current?.free) return
  stage.partOverrides[key] = {
    free: false,
    pose: relativePose(asmPoseOf(stage, key), current.pose),
  }
  const asmId = key.split(PART_SEP)[0]
  for (const link of stage.links) {
    if (link.nodeA === key) link.nodeA = asmId
    if (link.nodeB === key) link.nodeB = asmId
  }
  stage.links = stage.links.filter((l) => l.nodeA !== l.nodeB)
}

/** Puts a piece back exactly as its assembly had it, locked. Links made
 *  on it while it was released go, since it is no longer there. */
export function restorePart(stage: Stage, key: string): void {
  if (!stage.partOverrides[key]) return
  delete stage.partOverrides[key]
  stage.links = stage.links.filter((l) => l.nodeA !== key && l.nodeB !== key)
}
