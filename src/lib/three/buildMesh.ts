// Mesh building from uploaded files, pose/color/opacity application,
// keypoint-candidate extraction and mesh export. Typed port of
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
import { clamp, num } from '@/lib/utils'
import type { KeypointCandidate, MeshRecord, Pose } from '@/types/project'

export type DownloadFormat = 'glb' | 'obj' | 'stl'

function dataURLToArrayBuffer(dataURL: string): ArrayBuffer {
  const base64 = dataURL.slice(dataURL.indexOf(',') + 1)
  const bin = atob(base64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

function dataURLToText(dataURL: string): string {
  return new TextDecoder().decode(dataURLToArrayBuffer(dataURL))
}

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

/** Builds a self-contained three.js Object3D from an uploaded mesh
 *  record, at the scale it was authored in. */
export function buildMesh(meshRecord: MeshRecord): Promise<THREE.Object3D> {
  const ext = meshRecord.ext.toLowerCase()
  const wrap = new THREE.Group()
  wrap.name = meshRecord.name || meshRecord.id

  if (ext === 'glb' || ext === 'gltf') {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()
      if (!meshRecord.data) {
        reject(new Error('mesh has no data'))
        return
      }
      loader.parse(
        dataURLToArrayBuffer(meshRecord.data),
        '',
        (gltf) => {
          wrap.add(gltf.scene)
          resolve(centerMesh(wrap))
        },
        reject,
      )
    })
  }
  if (ext === 'obj') {
    if (!meshRecord.data) return Promise.reject(new Error('mesh has no data'))
    const loader = new OBJLoader()
    const obj = loader.parse(dataURLToText(meshRecord.data))
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.material) child.material = defaultMaterial()
    })
    wrap.add(obj)
    return Promise.resolve(centerMesh(wrap))
  }
  if (ext === 'stl') {
    if (!meshRecord.data) return Promise.reject(new Error('mesh has no data'))
    const loader = new STLLoader()
    const geometry = loader.parse(dataURLToArrayBuffer(meshRecord.data))
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, defaultMaterial(meshRecord.color))
    wrap.add(mesh)
    return Promise.resolve(centerMesh(wrap))
  }
  return Promise.reject(new Error('unsupported mesh format: ' + ext))
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

/** Bounding-box corners + face centers in WORLD space, each with an
 *  outward-pointing normal — good-enough keypoint snap candidates without
 *  needing per-vertex geometry access. */
export function keypointCandidates(object3d: THREE.Object3D): KeypointCandidate[] {
  object3d.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(object3d)
  if (box.isEmpty()) return []
  const { min, max } = box
  const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5)
  const pts: KeypointCandidate[] = []

  const corners: Array<[number, number, number]> = [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [min.x, max.y, min.z],
    [max.x, max.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [min.x, max.y, max.z],
    [max.x, max.y, max.z],
  ]
  for (const [x, y, z] of corners) {
    const n = { x: x === min.x ? -1 : 1, y: y === min.y ? -1 : 1, z: z === min.z ? -1 : 1 }
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1
    pts.push({ x, y, z, nx: n.x / len, ny: n.y / len, nz: n.z / len, label: 'corner' })
  }
  const faces: Array<{ p: [number, number, number]; n: [number, number, number] }> = [
    { p: [mid.x, mid.y, min.z], n: [0, 0, -1] },
    { p: [mid.x, mid.y, max.z], n: [0, 0, 1] },
    { p: [mid.x, min.y, mid.z], n: [0, -1, 0] },
    { p: [mid.x, max.y, mid.z], n: [0, 1, 0] },
    { p: [min.x, mid.y, mid.z], n: [-1, 0, 0] },
    { p: [max.x, mid.y, mid.z], n: [1, 0, 0] },
  ]
  for (const f of faces) {
    pts.push({ x: f.p[0], y: f.p[1], z: f.p[2], nx: f.n[0], ny: f.n[1], nz: f.n[2], label: 'face' })
  }
  return pts
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
