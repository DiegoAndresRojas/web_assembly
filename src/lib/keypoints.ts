// Pure geometry for keypoint linking: snap-candidate search, local frames,
// and single-axis rotation solving. No three.js dependency — callers that
// pick points on real geometry (lib/three/worldSession.ts, which owns the
// raycaster) hand plain vectors in here and get plain vectors back. Typed
// port of only_js/src/composables/useKeypoints.js.
import { clamp } from './utils'
import type { Axis, Pose, Vec3 } from '@/types/project'

const EPS = 1e-6
const DEG = 180 / Math.PI
const RAD = Math.PI / 180

export const vec = {
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  length: (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
  distance: (a: Vec3, b: Vec3): number => vec.length(vec.sub(a, b)),
  normalize: (a: Vec3): Vec3 => {
    const l = vec.length(a)
    return l < EPS ? { x: 0, y: 0, z: 0 } : vec.scale(a, 1 / l)
  },
  negate: (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z }),
}

/** Extrinsic X -> Y -> Z rotation of a vector by degrees. Only used for
 *  this module's own preview math (gap / candidate ranking); rendering
 *  applies rotations through three.js directly. */
export function rotateEuler(v: Vec3, deg: Vec3): Vec3 {
  let p = v
  const rx = deg.x * RAD
  const ry = deg.y * RAD
  const rz = deg.z * RAD
  if (rx) {
    const c = Math.cos(rx)
    const s = Math.sin(rx)
    p = { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
  }
  if (ry) {
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    p = { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
  }
  if (rz) {
    const c = Math.cos(rz)
    const s = Math.sin(rz)
    p = { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z }
  }
  return p
}

/** Inverse of rotateEuler's X -> Y -> Z composition: Z -> Y -> X, negated. */
export function rotateEulerInverse(v: Vec3, deg: Vec3): Vec3 {
  let p = v
  const rx = -deg.x * RAD
  const ry = -deg.y * RAD
  const rz = -deg.z * RAD
  if (rz) {
    const c = Math.cos(rz)
    const s = Math.sin(rz)
    p = { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z }
  }
  if (ry) {
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    p = { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
  }
  if (rx) {
    const c = Math.cos(rx)
    const s = Math.sin(rx)
    p = { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
  }
  return p
}

export function pointWorld(pose: Pose, local: Vec3): Vec3 {
  return vec.add(rotateEuler(local, pose.rot), pose.pos)
}

const AXES: Record<Axis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
}

/** Signed angle (radians) to rotate `vFrom` about `axis` so it aligns with
 *  `vTo`, both projected onto the plane perpendicular to `axis`. Returns
 *  `null` when either vector is (near-)parallel to `axis` — no rotation
 *  about that axis can solve it (a genuine degenerate case, as opposed to
 *  a legitimate zero-angle solution). */
export function axisAngle(axis: Axis, vFrom: Vec3, vTo: Vec3): number | null {
  const a = AXES[axis]
  const pf = vec.sub(vFrom, vec.scale(a, vec.dot(vFrom, a)))
  const pt = vec.sub(vTo, vec.scale(a, vec.dot(vTo, a)))
  const lf = vec.length(pf)
  const lt = vec.length(pt)
  if (lf < EPS || lt < EPS) return null
  const nf = vec.scale(pf, 1 / lf)
  const nt = vec.scale(pt, 1 / lt)
  const cosT = clamp(vec.dot(nf, nt), -1, 1)
  const sinT = vec.dot(vec.cross(nf, nt), a)
  return Math.atan2(sinT, cosT)
}

/** Degrees to add to node A's rotation on `axis` so its (current world)
 *  point normal faces node B's point normal (i.e. becomes anti-parallel to
 *  it — the two surfaces meet face to face). `null` if degenerate. */
export function solveAxisAlign(axis: Axis, normalAWorld: Vec3, normalBWorld: Vec3): number | null {
  const target = vec.negate(normalBWorld)
  const rad = axisAngle(axis, normalAWorld, target)
  return rad === null ? null : rad * DEG
}

export function gap(pointAWorld: Vec3, pointBWorld: Vec3): number {
  return vec.distance(pointAWorld, pointBWorld)
}

export interface Frame {
  origin: Vec3
  normal: Vec3
  tangent: Vec3
  bitangent: Vec3
}

/** Local frame at a picked point: normal + two tangents, so a caller can
 *  draw axis handles or reason about surface orientation there. */
export function frameAt(point: Vec3, normal: Vec3, hintUp?: Vec3): Frame {
  const n = vec.normalize(normal)
  let up = hintUp ?? { x: 0, y: 1, z: 0 }
  if (Math.abs(vec.dot(n, up)) > 0.98) up = { x: 1, y: 0, z: 0 }
  const tangent = vec.normalize(vec.cross(up, n))
  const bitangent = vec.cross(n, tangent)
  return { origin: point, normal: n, tangent, bitangent }
}

export interface Candidate<T> {
  index: number
  point: T
  dist: number
}

/** Nearest candidate points to `target`, closest first, capped at `limit`
 *  (default 6) within `radius` (default Infinity). */
export function nearestCandidates<T extends Vec3>(
  points: T[],
  target: Vec3,
  opts?: { radius?: number; limit?: number },
): Candidate<T>[] {
  const radius = opts?.radius ?? Infinity
  const limit = opts?.limit ?? 6
  return points
    .map((p, i) => ({ index: i, point: p, dist: vec.distance(p, target) }))
    .filter((c) => c.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
}
