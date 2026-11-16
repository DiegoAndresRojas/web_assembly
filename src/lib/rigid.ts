// Rigid-body math over the plain Pose data the store persists (position +
// Euler degrees in three.js 'XYZ' order — what applyPose hands to three).
// three.js is used for its math only.
import * as THREE from 'three'

import type { Pose, Vec3 } from '@/types/project'

const ONE = new THREE.Vector3(1, 1, 1)

export function poseMatrix(pose: Pose): THREE.Matrix4 {
  const r = THREE.MathUtils.degToRad
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(r(pose.rot.x), r(pose.rot.y), r(pose.rot.z), 'XYZ'),
  )
  return new THREE.Matrix4().compose(new THREE.Vector3(pose.pos.x, pose.pos.y, pose.pos.z), q, ONE)
}

export function matrixPose(m: THREE.Matrix4): Pose {
  const pos = new THREE.Vector3()
  const q = new THREE.Quaternion()
  m.decompose(pos, q, new THREE.Vector3())
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const d = THREE.MathUtils.radToDeg
  return { pos: { x: pos.x, y: pos.y, z: pos.z }, rot: { x: d(e.x), y: d(e.y), z: d(e.z) } }
}

/** A child's pose in its parent's space, taken out into the space the
 *  parent itself is posed in. */
export function composePoses(parent: Pose, local: Pose): Pose {
  return matrixPose(poseMatrix(parent).multiply(poseMatrix(local)))
}

/** The inverse: `world` expressed relative to `parent`. */
export function relativePose(parent: Pose, world: Pose): Pose {
  return matrixPose(poseMatrix(parent).invert().multiply(poseMatrix(world)))
}

/** The rigid motion that takes a body from pose `from` to pose `to`. */
export function deltaBetween(from: Pose, to: Pose): THREE.Matrix4 {
  return poseMatrix(to).multiply(poseMatrix(from).invert())
}

/** `pose` after the rigid motion `delta`. */
export function movePose(delta: THREE.Matrix4, pose: Pose): Pose {
  return matrixPose(delta.clone().multiply(poseMatrix(pose)))
}

export function movePoint(delta: THREE.Matrix4, p: Vec3): Vec3 {
  const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(delta)
  return { x: v.x, y: v.y, z: v.z }
}

export function moveDirection(delta: THREE.Matrix4, d: Vec3): Vec3 {
  const v = new THREE.Vector3(d.x, d.y, d.z).transformDirection(delta)
  return { x: v.x, y: v.y, z: v.z }
}
