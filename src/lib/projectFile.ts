// A project as one file that can be handed to someone else or kept as a
// backup: a ZIP holding `project.json` (the project as it is saved) and
// the mesh files it uses under `files/<hash>`.
import { hashOf, meshBytes, putFile } from './meshFiles'
import { CURRENT_VERSION, normalizeProject } from './migrations'
import { uid } from './utils'
import { buildZip, readZip, type ZipEntry } from './zip'
import type { MeshRecord, Project } from '@/types/project'

const FORMAT = 'meshstudio-project'
const MANIFEST = 'project.json'
const FILES = 'files/'

export const PROJECT_FILE_EXT = 'meshstudio'

/** A file name for the project: its own name, made safe for any system. */
export function projectFileName(project: Project): string {
  const base = project.name
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'project') + '.' + PROJECT_FILE_EXT
}

export interface PackedProject {
  blob: Blob
  /** Library meshes whose file could not be found, by name: the project
   *  is packed without them. */
  missing: string[]
}

export async function packProject(project: Project): Promise<PackedProject> {
  const files = new Map<string, ArrayBuffer>()
  const missing: string[] = []
  const meshes: MeshRecord[] = []
  for (const mesh of project.meshes) {
    try {
      const data = await meshBytes(mesh)
      const hash = mesh.hash ?? (await hashOf(data))
      files.set(hash, data)
      meshes.push({ ...mesh, hash, bytes: data.byteLength, data: null })
    } catch {
      missing.push(mesh.name)
      meshes.push({ ...mesh, data: null })
    }
  }
  const manifest = { format: FORMAT, version: CURRENT_VERSION, project: { ...project, meshes } }
  const entries: ZipEntry[] = [
    { name: MANIFEST, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) },
  ]
  for (const [hash, data] of files) entries.push({ name: FILES + hash, blob: new Blob([data]) })
  return { blob: await buildZip(entries), missing }
}

export interface UnpackedProject {
  /** Ready to add to the store, under an id of its own. */
  project: Project
  /** Library meshes the file came without, by name. */
  missing: string[]
}

/** Reads a project file, storing the mesh files it carries. Rejects when
 *  the file is not a project, or was made by a newer version of the app. */
export async function unpackProject(file: Blob): Promise<UnpackedProject> {
  const notOurs = new Error('this is not a Mesh Studio project file')
  const entries = await readZip(file).catch(() => {
    throw notOurs
  })
  const manifestEntry = entries.find((e) => e.name === MANIFEST)
  if (!manifestEntry) throw notOurs
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(new TextDecoder().decode(await manifestEntry.read())) as Record<
      string,
      unknown
    >
  } catch {
    throw notOurs
  }
  if (manifest.format !== FORMAT) throw notOurs
  if (typeof manifest.version === 'number' && manifest.version > CURRENT_VERSION) {
    throw new Error('this project was made with a newer version of Mesh Studio')
  }
  const project = normalizeProject(manifest.project)
  if (!project) throw notOurs
  // never the id of a project that is already here (the same file twice)
  project.id = uid()

  const stored = new Map<string, string | null>()
  const missing: string[] = []
  for (const mesh of project.meshes) {
    mesh.data = null
    const declared = mesh.hash
    if (declared && !stored.has(declared)) {
      const entry = entries.find((e) => e.name === FILES + declared)
      stored.set(declared, entry ? await putFile(await entry.read()) : null)
    }
    mesh.hash = declared ? (stored.get(declared) ?? null) : null
    if (!mesh.hash) missing.push(mesh.name)
  }
  return { project, missing }
}
