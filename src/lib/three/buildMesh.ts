// Mesh building from uploaded files, pose/color/opacity application and
// mesh export (keypoint snapping lives in surfaceSnap.ts). Typed port of
// only_js/src/composables/useThree.js — three is now a real npm
// dependency, so loaders/exporters are static imports instead of
// esm.sh dynamic import()s.
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'

import { DEFAULT_MESH_COLOR } from '@/lib/constants'
import { meshBytes } from '@/lib/meshFiles'
import { clamp, num } from '@/lib/utils'
import type { MeshRecord, Pose, Vec3 } from '@/types/project'

export type DownloadFormat = 'glb' | 'obj' | 'stl'

function defaultMaterial(colorHex?: string | null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colorHex ?? DEFAULT_MESH_COLOR,
    roughness: 0.55,
    metalness: 0.15,
  })
}

/** Recenters the object on its own bounding-box center (so its pivot is
 *  predictable for keypoint math) without touching scale — the file's
 *  native units are what make relative sizes between different parts
 *  meaningful, so nothing here may rescale the geometry. */
function centerMesh(object3d: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(object3d)
  if (box.isEmpty()) return object3d
  const center = new THREE.Vector3()
  box.getCenter(center)
  object3d.position.sub(center)
  return object3d
}

/** Reads a mesh file into a three.js object, at the scale it was
 *  authored in. */
async function parseMesh(meshRecord: MeshRecord): Promise<THREE.Object3D> {
  const ext = meshRecord.ext.toLowerCase()
  const wrap = new THREE.Group()
  wrap.name = meshRecord.name || meshRecord.id
  if (ext !== 'glb' && ext !== 'gltf' && ext !== 'obj' && ext !== 'stl') {
    throw new Error('unsupported mesh format: ' + (ext || 'none'))
  }
  const bytes = await meshBytes(meshRecord)

  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
      new GLTFLoader().parse(bytes, '', resolve, reject)
    })
    wrap.add(gltf.scene)
  } else if (ext === 'obj') {
    const obj = new OBJLoader().parse(new TextDecoder().decode(bytes))
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.material) child.material = defaultMaterial()
    })
    wrap.add(obj)
  } else {
    const geometry = new STLLoader().parse(bytes)
    geometry.computeVertexNormals()
    wrap.add(new THREE.Mesh(geometry, defaultMaterial()))
  }
  return centerMesh(wrap)
}

/** Each file as it was parsed, by what it holds: opening a stage, or a
 *  file wired into several of them, reads it once. */
const parsed = new Map<string, Promise<THREE.Object3D>>()

function cacheKey(meshRecord: MeshRecord): string {
  return (meshRecord.hash ?? 'mesh:' + meshRecord.id) + '.' + meshRecord.ext.toLowerCase()
}

/** Builds a three.js Object3D of an uploaded mesh, at the scale it was
 *  authored in. Every call gets an object of its own; the geometry (and
 *  the materials, until one is changed — see ownMaterial) is shared with
 *  the others of the same file, so it must be treated as read-only. */
export function buildMesh(meshRecord: MeshRecord): Promise<THREE.Object3D> {
  const key = cacheKey(meshRecord)
  let reading = parsed.get(key)
  if (!reading) {
    reading = parseMesh(meshRecord)
    parsed.set(key, reading)
    // a file that failed to load is read again the next time it is asked for
    reading.catch(() => parsed.delete(key))
  }
  return reading.then((object) => object.clone(true))
}

/** Forgets the parsed files other than those of `meshes` — called with
 *  the open project's library, so memory holds one project's parts. */
export function keepParsedMeshes(meshes: MeshRecord[]): void {
  const keep = new Set(meshes.map(cacheKey))
  for (const key of Array.from(parsed.keys())) if (!keep.has(key)) parsed.delete(key)
}

/** Frees what the renderer holds for an object built here (buffers on the
 *  graphics card, compiled shaders). The parsed file stays in memory: a
 *  new renderer uploads it again without reading the file. */
export function releaseObject(object3d: THREE.Object3D): void {
  object3d.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials as THREE.Material[]) material.dispose()
  })
}

/** Bounding-box size of a mesh file in its native units. */
export async function measureMesh(meshRecord: MeshRecord): Promise<Vec3> {
  const obj = await buildMesh(meshRecord)
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
  return { x: size.x, y: size.y, z: size.z }
}

export function applyPose(object3d: THREE.Object3D, pose: Pose): void {
  object3d.position.set(pose.pos.x, pose.pos.y, pose.pos.z)
  object3d.rotation.set(
    THREE.MathUtils.degToRad(pose.rot.x),
    THREE.MathUtils.degToRad(pose.rot.y),
    THREE.MathUtils.degToRad(pose.rot.z),
    'XYZ',
  )
}

/** The object's local pose (relative to its parent), inverse of applyPose. */
export function readPose(object3d: THREE.Object3D): Pose {
  const e = new THREE.Euler().setFromQuaternion(object3d.quaternion, 'XYZ')
  const d = THREE.MathUtils.radToDeg
  const p = object3d.position
  return { pos: { x: p.x, y: p.y, z: p.z }, rot: { x: d(e.x), y: d(e.y), z: d(e.z) } }
}

interface OwnMaterialUserData {
  __msOwnMaterial?: boolean
}

function ownMaterial(mesh: THREE.Mesh): THREE.Material {
  const data = mesh.userData as OwnMaterialUserData
  if (!data.__msOwnMaterial) {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : (mesh.material as THREE.Material).clone()
    data.__msOwnMaterial = true
  }
  return mesh.material as THREE.Material
}

export function applyColor(object3d: THREE.Object3D, colorHex: string | null | undefined): void {
  if (!colorHex) return
  object3d.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mat = ownMaterial(child)
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
      mat.color.set(colorHex)
    }
  })
}

export function applyOpacity(object3d: THREE.Object3D, opacity: number): void {
  const o = clamp(num(opacity, 1), 0.05, 1)
  object3d.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mat = ownMaterial(child)
    mat.transparent = o < 1
    mat.opacity = o
  })
}

function blobFromExport(
  result: ArrayBuffer | DataView<ArrayBuffer> | string | object,
  mime: string,
): Blob {
  if (result instanceof ArrayBuffer) return new Blob([result], { type: mime })
  if (result instanceof DataView) return new Blob([result], { type: mime })
  if (typeof result === 'string') return new Blob([result], { type: mime })
  return new Blob([JSON.stringify(result)], { type: mime })
}

/** Exports a group of live three.js objects (already posed in world
 *  space) as a single file in the requested format. */
export function exportGroup(objects: THREE.Object3D[], format: DownloadFormat): Promise<Blob> {
  const group = new THREE.Group()
  for (const obj of objects) group.add(obj.clone(true))

  return new Promise((resolve, reject) => {
    if (format === 'obj') {
      const exporter = new OBJExporter()
      resolve(blobFromExport(exporter.parse(group), 'text/plain'))
      return
    }
    if (format === 'stl') {
      const exporter = new STLExporter()
      resolve(blobFromExport(exporter.parse(group, { binary: true }), 'model/stl'))
      return
    }
    const exporter = new GLTFExporter()
    exporter.parse(
      group,
      (result) => resolve(blobFromExport(result, 'model/gltf-binary')),
      reject,
      { binary: true },
    )
  })
}
