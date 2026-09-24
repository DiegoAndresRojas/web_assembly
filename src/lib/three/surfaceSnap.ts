// Keypoint snapping on the actual mesh surface (not its bounding box).
// A raycast hit lands on some flat face of the mesh (coplanar triangles
// merged — STL tessellation splits one flat face into many triangles).
//   'edges' → that face's outline is split into its real edges (collinear
//             boundary segments merged); the hit snaps to the nearest
//             corner or edge midpoint
//   'faces' → the hit snaps to the center of that flat face
// Everything returned is in WORLD space.
import * as THREE from 'three'

import type { Vec3 } from '@/types/project'

export type SnapMode = 'edges' | 'faces'

/** Points between each edge's two corners in 'edges' mode (1 = midpoint). */
const EDGE_MARKS = 1

export interface SurfaceSnap {
  point: Vec3
  normal: Vec3
  /** Every snap candidate on the hovered face, for display. */
  candidates: Vec3[]
}

/** Two adjacent triangles belong to the same flat face when their
 *  normals are within ~2.5°. */
const COPLANAR_COS = 0.999
/** Consecutive outline segments are one straight edge when their
 *  directions are within ~1.8°. */
const COLLINEAR_COS = 0.9995

type Edge = [THREE.Vector3, THREE.Vector3]

interface FaceRegions {
  /** Union-find root per triangle. */
  root: Int32Array
  /** Welded vertex id per position-attribute vertex. */
  welded: Int32Array
  /** Triangles per region root, built lazily. */
  tris: Map<number, number[]> | null
  /** Straight edges of each region's outline (local space). */
  edges: Map<number, Edge[]>
  /** Snap candidates per `${root}:${marks}` (local space). */
  candidates: Map<string, THREE.Vector3[]>
  /** Face center per region root (local space). */
  centers: Map<number, THREE.Vector3>
}

const regionCache = new WeakMap<THREE.BufferGeometry, FaceRegions>()

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _tri = new THREE.Triangle()

function toVec3(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position')
  return Math.floor((geometry.index ? geometry.index.count : pos.count) / 3)
}

function vertexIndex(geometry: THREE.BufferGeometry, tri: number, corner: number): number {
  const i = tri * 3 + corner
  return geometry.index ? geometry.index.getX(i) : i
}

function readTriangle(geometry: THREE.BufferGeometry, tri: number): void {
  const pos = geometry.getAttribute('position')
  _a.fromBufferAttribute(pos, vertexIndex(geometry, tri, 0))
  _b.fromBufferAttribute(pos, vertexIndex(geometry, tri, 1))
  _c.fromBufferAttribute(pos, vertexIndex(geometry, tri, 2))
}

/** Groups triangles into flat faces: triangles sharing an edge (after
 *  welding duplicate vertex positions — STL files are never indexed) with
 *  near-identical normals are unioned. Computed once per geometry. */
function faceRegions(geometry: THREE.BufferGeometry): FaceRegions {
  const cached = regionCache.get(geometry)
  if (cached) return cached

  const pos = geometry.getAttribute('position')
  const triCount = triangleCount(geometry)

  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const diag = geometry.boundingBox!.getSize(new THREE.Vector3()).length() || 1
  const q = 1 / (diag * 1e-5)

  // weld vertices by quantized position
  const weldKey = new Map<string, number>()
  const welded = new Int32Array(pos.count)
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const key = Math.round(p.x * q) + ',' + Math.round(p.y * q) + ',' + Math.round(p.z * q)
    let id = weldKey.get(key)
    if (id === undefined) {
      id = weldKey.size
      weldKey.set(key, id)
    }
    welded[i] = id
  }
  const nVerts = weldKey.size

  const normals = new Float32Array(triCount * 3)
  const n = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    readTriangle(geometry, t)
    _tri.set(_a, _b, _c).getNormal(n)
    normals[t * 3] = n.x
    normals[t * 3 + 1] = n.y
    normals[t * 3 + 2] = n.z
  }

  const root = new Int32Array(triCount)
  for (let t = 0; t < triCount; t++) root[t] = t
  const find = (x: number): number => {
    while (root[x] !== x) {
      root[x] = root[root[x]]
      x = root[x]
    }
    return x
  }

  const edgeOwner = new Map<number, number>()
  for (let t = 0; t < triCount; t++) {
    if (normals[t * 3] === 0 && normals[t * 3 + 1] === 0 && normals[t * 3 + 2] === 0) continue
    for (let e = 0; e < 3; e++) {
      const v0 = welded[vertexIndex(geometry, t, e)]
      const v1 = welded[vertexIndex(geometry, t, (e + 1) % 3)]
      if (v0 === v1) continue
      const key = Math.min(v0, v1) * nVerts + Math.max(v0, v1)
      const other = edgeOwner.get(key)
      if (other === undefined) {
        edgeOwner.set(key, t)
        continue
      }
      const dot =
        normals[t * 3] * normals[other * 3] +
        normals[t * 3 + 1] * normals[other * 3 + 1] +
        normals[t * 3 + 2] * normals[other * 3 + 2]
      if (dot < COPLANAR_COS) continue
      const ra = find(t)
      const rb = find(other)
      if (ra !== rb) root[ra] = rb
    }
  }
  for (let t = 0; t < triCount; t++) root[t] = find(t)

  const regions: FaceRegions = {
    root,
    welded,
    tris: null,
    edges: new Map(),
    candidates: new Map(),
    centers: new Map(),
  }
  regionCache.set(geometry, regions)
  return regions
}

function regionTris(regions: FaceRegions, regionRoot: number): number[] {
  if (!regions.tris) {
    regions.tris = new Map()
    for (let t = 0; t < regions.root.length; t++) {
      const r = regions.root[t]
      let list = regions.tris.get(r)
      if (!list) regions.tris.set(r, (list = []))
      list.push(t)
    }
  }
  return regions.tris.get(regionRoot) ?? []
}

/** The flat face's outline as straight edges: triangle edges used exactly
 *  once inside the region form the boundary; runs of collinear boundary
 *  segments are merged, so a long edge tessellated into several pieces
 *  still yields one edge (and one true midpoint). */
function regionEdges(
  geometry: THREE.BufferGeometry,
  regions: FaceRegions,
  regionRoot: number,
): Edge[] {
  const cached = regions.edges.get(regionRoot)
  if (cached) return cached

  const pos = geometry.getAttribute('position')
  const posOf = new Map<number, THREE.Vector3>()
  const edgeCount = new Map<string, [number, number, number]>()
  for (const t of regionTris(regions, regionRoot)) {
    for (let e = 0; e < 3; e++) {
      const i0 = vertexIndex(geometry, t, e)
      const i1 = vertexIndex(geometry, t, (e + 1) % 3)
      const v0 = regions.welded[i0]
      const v1 = regions.welded[i1]
      if (v0 === v1) continue
      if (!posOf.has(v0)) posOf.set(v0, new THREE.Vector3().fromBufferAttribute(pos, i0))
      if (!posOf.has(v1)) posOf.set(v1, new THREE.Vector3().fromBufferAttribute(pos, i1))
      const key = v0 < v1 ? v0 + ':' + v1 : v1 + ':' + v0
      const entry = edgeCount.get(key)
      if (entry) entry[2]++
      else edgeCount.set(key, [v0, v1, 1])
    }
  }

  // boundary adjacency: vertex -> neighbouring boundary vertices
  const adj = new Map<number, number[]>()
  for (const [v0, v1, count] of edgeCount.values()) {
    if (count !== 1) continue
    if (!adj.has(v0)) adj.set(v0, [])
    if (!adj.has(v1)) adj.set(v1, [])
    adj.get(v0)!.push(v1)
    adj.get(v1)!.push(v0)
  }

  const dir = (from: number, to: number) => posOf.get(to)!.clone().sub(posOf.get(from)!).normalize()
  // a pass-through vertex sits in the middle of a straight edge
  const isPassThrough = (v: number): boolean => {
    const nb = adj.get(v)!
    if (nb.length !== 2) return false
    return dir(nb[0], v).dot(dir(v, nb[1])) > COLLINEAR_COS
  }

  const visited = new Set<string>()
  const edgeKey = (a: number, b: number) => (a < b ? a + ':' + b : b + ':' + a)
  const edges: Edge[] = []
  const walkFrom = (start: number) => {
    for (const first of adj.get(start)!) {
      if (visited.has(edgeKey(start, first))) continue
      visited.add(edgeKey(start, first))
      let prev = start
      let cur = first
      while (isPassThrough(cur) && cur !== start) {
        const next = adj.get(cur)!.find((v) => v !== prev)!
        if (visited.has(edgeKey(cur, next))) break
        visited.add(edgeKey(cur, next))
        prev = cur
        cur = next
      }
      edges.push([posOf.get(start)!, posOf.get(cur)!])
    }
  }
  for (const v of adj.keys()) if (!isPassThrough(v)) walkFrom(v)
  // loops made only of pass-through vertices can't exist geometrically,
  // but guard against float noise leaving edges unvisited
  for (const v of adj.keys()) walkFrom(v)

  regions.edges.set(regionRoot, edges)
  return edges
}

function regionCandidates(
  geometry: THREE.BufferGeometry,
  regions: FaceRegions,
  regionRoot: number,
  marks: number,
): THREE.Vector3[] {
  const key = regionRoot + ':' + marks
  const cached = regions.candidates.get(key)
  if (cached) return cached

  const seen = new Set<string>()
  const out: THREE.Vector3[] = []
  const push = (v: THREE.Vector3) => {
    const k = v.x.toPrecision(6) + ',' + v.y.toPrecision(6) + ',' + v.z.toPrecision(6)
    if (seen.has(k)) return
    seen.add(k)
    out.push(v)
  }
  const steps = marks + 1
  for (const [a, b] of regionEdges(geometry, regions, regionRoot)) {
    for (let k = 0; k <= steps; k++) push(a.clone().lerp(b, k / steps))
  }
  regions.candidates.set(key, out)
  return out
}

/** Area-weighted centroid of a flat face, then pulled onto the nearest
 *  point of the face itself so it never floats in a hole (ring-shaped or
 *  L-shaped faces have their centroid outside the surface). Local space. */
function regionCenter(
  geometry: THREE.BufferGeometry,
  regions: FaceRegions,
  regionRoot: number,
): THREE.Vector3 {
  const cached = regions.centers.get(regionRoot)
  if (cached) return cached

  const tris = regionTris(regions, regionRoot)
  const centroid = new THREE.Vector3()
  const mid = new THREE.Vector3()
  let area = 0
  for (const t of tris) {
    readTriangle(geometry, t)
    _tri.set(_a, _b, _c)
    const ta = _tri.getArea()
    _tri.getMidpoint(mid)
    centroid.addScaledVector(mid, ta)
    area += ta
  }
  if (area > 0) centroid.divideScalar(area)

  const best = new THREE.Vector3()
  const candidate = new THREE.Vector3()
  let bestDist = Infinity
  for (const t of tris) {
    readTriangle(geometry, t)
    _tri.set(_a, _b, _c).closestPointToPoint(centroid, candidate)
    const d = candidate.distanceToSquared(centroid)
    if (d < bestDist) {
      bestDist = d
      best.copy(candidate)
    }
  }

  regions.centers.set(regionRoot, best)
  return best
}

function worldNormal(object: THREE.Object3D, local: THREE.Vector3): THREE.Vector3 {
  const m = new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
  return local.clone().applyMatrix3(m).normalize()
}

/** Snaps a raycast hit onto the flat face it landed on: to its nearest
 *  corner / edge midpoint ('edges') or to its center ('faces'). */
export function snapIntersection(hit: THREE.Intersection, mode: SnapMode): SurfaceSnap {
  const object = hit.object
  const mesh = object instanceof THREE.Mesh ? object : null
  const geometry = mesh?.geometry instanceof THREE.BufferGeometry ? mesh.geometry : null
  const faceIndex = hit.faceIndex

  const normal = toVec3(
    hit.face ? worldNormal(object, hit.face.normal) : new THREE.Vector3(0, 1, 0),
  )
  if (!geometry || faceIndex === undefined || faceIndex === null) {
    return { point: toVec3(hit.point), normal, candidates: [] }
  }

  object.updateWorldMatrix(true, false)
  const regions = faceRegions(geometry)
  const regionRoot = regions.root[faceIndex]
  if (mode === 'faces') {
    const center = regionCenter(geometry, regions, regionRoot)
    const point = toVec3(center.clone().applyMatrix4(object.matrixWorld))
    return { point, normal, candidates: [point] }
  }
  const local = regionCandidates(geometry, regions, regionRoot, EDGE_MARKS)
  if (!local.length) return { point: toVec3(hit.point), normal, candidates: [] }

  const world = local.map((v) => v.clone().applyMatrix4(object.matrixWorld))
  let best = world[0]
  let bestDist = Infinity
  for (const w of world) {
    const d = w.distanceToSquared(hit.point)
    if (d < bestDist) {
      bestDist = d
      best = w
    }
  }
  return { point: toVec3(best), normal, candidates: world.map(toVec3) }
}
