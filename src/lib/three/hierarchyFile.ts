// The assembly hierarchy (lib/hierarchy.ts) as one file for the training
// pipeline: a ZIP holding `assembly.json` and, under `meshes/`, the file
// of each piece as it was uploaded. Unzipped anywhere, assembly.json finds
// its meshes next to it.
import * as THREE from 'three'

import { buildHierarchy, type Hierarchy, type MeshCenters } from '@/lib/hierarchy'
import { meshBytes } from '@/lib/meshFiles'
import { buildZip, type ZipEntry } from '@/lib/zip'
import { buildMesh } from './buildMesh'
import type { HierarchyExport, MeshRecord, Project } from '@/types/project'

/** Each mesh's bounding-box center in its file's own coordinates (the
 *  loaders recenter what they read; this undoes that). Meshes that cannot
 *  be read are left out: their pieces are named by order, not place. */
export async function meshCenters(meshes: MeshRecord[]): Promise<MeshCenters> {
  const out: MeshCenters = {}
  for (const mesh of meshes) {
    try {
      const obj = await buildMesh(mesh)
      obj.position.set(0, 0, 0)
      obj.updateMatrixWorld(true)
      const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3())
      out[mesh.id] = { x: c.x, y: c.y, z: c.z }
    } catch {
      // (no file in this browser)
    }
  }
  return out
}

export function hierarchyFileName(project: Project): string {
  const base = project.name
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'project') + '.hierarchy.zip'
}

export interface PackedHierarchy {
  blob: Blob
  hierarchy: Hierarchy
}

/** Throws with the hierarchy's problems when it cannot be exported. */
export async function packHierarchy(
  project: Project,
  settings: HierarchyExport,
): Promise<PackedHierarchy> {
  const hierarchy = buildHierarchy(project, settings, await meshCenters(project.meshes))
  if (hierarchy.problems.length) throw new Error(hierarchy.problems.join(' '))
  const entries: ZipEntry[] = [
    {
      name: 'assembly.json',
      blob: new Blob([JSON.stringify(hierarchy.document, null, 2) + '\n'], {
        type: 'application/json',
      }),
    },
  ]
  for (const part of hierarchy.parts) {
    const mesh = project.meshes.find((m) => m.id === part.meshId)!
    let data: ArrayBuffer
    try {
      data = await meshBytes(mesh)
    } catch {
      throw new Error(`the file of ${mesh.name} is not in this browser`)
    }
    entries.push({ name: part.path, blob: new Blob([data]) })
  }
  return { blob: await buildZip(entries), hierarchy }
}
