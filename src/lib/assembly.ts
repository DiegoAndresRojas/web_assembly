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
import type { Axis, KeypointLink, Pose, Stage, Vec3 } from '@/types/project'

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
  if (withB.includes(link.nodeA)) {
    // already tied to A some other way: those links hold, B only turns
    // about them
    solveHeldLink(stage, link, others)
    return
  }
  moveBodies(stage, [link.nodeB, ...withB], delta)
  refreshLinks(stage)
}

/** Links closer than this count as touching. */
const TOUCH = 1e-3

/** Re-reads whether each link's two points touch, after bodies moved. */
export function refreshLinks(stage: Stage): void {
  for (const link of stage.links) {
    const gap = vec.distance(link.pointA, link.pointB)
    link.gap = gap <= TOUCH ? 0 : gap
    link.state = gap <= TOUCH ? 'solved' : 'gap'
  }
}

/** The bodies that turn with `id` when it pivots against `fixed`: `id`
 *  and whatever hangs on it without going through `fixed`. */
export function turningSide(links: KeypointLink[], id: string, fixed: string): string[] {
  const free = links.filter((l) => l.nodeA !== fixed && l.nodeB !== fixed)
  return [id, ...linkedBodies(free, id)].filter((b) => b !== fixed)
}

/** The point on `side`'s end of a link. */
const endOn = (link: KeypointLink, side: Set<string>): Vec3 =>
  side.has(link.nodeA) ? link.pointA : link.pointB

function rotationAbout(pivot: Vec3, q: THREE.Quaternion): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
}

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z)

/** A new link between two bodies already tied together: the links that
 *  tie B's side to the rest stay where they are, and B's side turns about
 *  them to bring the new points together — about the one point they share
 *  (one link), or about the line through two of them (two or more). What
 *  the turn cannot close stays as a gap on the new link. */
function solveHeldLink(stage: Stage, link: KeypointLink, others: KeypointLink[]): void {
  const turning = new Set(turningSide(others, link.nodeB, link.nodeA))
  const holds = others.filter((l) => turning.has(l.nodeA) !== turning.has(l.nodeB))
  const pivot = holds.length ? v3(endOn(holds[0], turning)) : null
  if (pivot) {
    const from = v3(link.pointB).sub(pivot)
    const to = v3(link.pointA).sub(pivot)
    const second = holds.slice(1).find((l) => v3(endOn(l, turning)).distanceTo(pivot) > TOUCH)
    let q: THREE.Quaternion | null = null
    if (second) {
      // a hinge: only a turn about the line through the two held points
      const axis = v3(endOn(second, turning)).sub(pivot).normalize()
      const f = from.clone().projectOnPlane(axis)
      const t = to.clone().projectOnPlane(axis)
      if (f.length() > TOUCH && t.length() > TOUCH) {
        const angle = Math.atan2(f.clone().cross(t).dot(axis), f.dot(t))
        q = new THREE.Quaternion().setFromAxisAngle(axis, angle)
      }
    } else if (from.length() > TOUCH && to.length() > TOUCH) {
      q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize())
    }
    if (q) moveBodies(stage, [...turning], rotationAbout(endOn(holds[0], turning), q))
  }
  refreshLinks(stage)
}

// ---------- turning about a keypoint ----------

/** Where body `id` pivots when turned: the point of its latest link, with
 *  the bodies on its side of that link (itself included), which turn
 *  while the other side stays. Null when it is not linked. */
export function hingeOf(
  stage: Stage,
  id: string,
): { pivot: Vec3; fixed: string; turning: string[] } | null {
  const link = [...stage.links].reverse().find((l) => l.nodeA === id || l.nodeB === id)
  if (!link) return null
  const fixed = link.nodeA === id ? link.nodeB : link.nodeA
  const pivot = link.nodeA === id ? link.pointA : link.pointB
  return { pivot: { ...pivot }, fixed, turning: turningSide(stage.links, id, fixed) }
}

/** Turns body `id` to the orientation `rot` (Euler degrees) about `pivot`,
 *  carrying `turning` with it; links across stay or open as gaps. */
export function turnBodyAbout(
  stage: Stage,
  id: string,
  rot: Vec3,
  pivot: Vec3,
  turning: string[],
): void {
  const from = bodyPose(stage, id)
  if (!from) return
  const qOf = (r: Vec3) =>
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(r.x),
        THREE.MathUtils.degToRad(r.y),
        THREE.MathUtils.degToRad(r.z),
        'XYZ',
      ),
    )
  const q = qOf(rot).multiply(qOf(from.rot).invert())
  moveBodies(stage, [...new Set([id, ...turning])], rotationAbout(pivot, q))
  // exactly the angles asked for, not the round trip through a matrix
  const pose = bodyPose(stage, id)
  if (pose) setBodyPose(stage, id, { pos: pose.pos, rot: { ...rot } })
  refreshLinks(stage)
}

/** Turns body `id` (a gizmo turn) about its latest link's point; without
 *  links it simply takes the pose. */
export function turnBodyTo(stage: Stage, id: string, pose: Pose): void {
  const hinge = hingeOf(stage, id)
  if (!hinge) {
    moveBodyTo(stage, id, pose)
    return
  }
  turnBodyAbout(stage, id, pose.rot, hinge.pivot, hinge.turning)
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
