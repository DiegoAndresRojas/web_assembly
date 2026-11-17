// What the app does on its own once the saved projects are loaded.
import {
  dataUrlBytes,
  dropUnusedFiles,
  dropUnusedThumbs,
  filesAreKept,
  putFile,
} from '@/lib/meshFiles'
import { savedProjectsWereRead } from './persistStorage'
import type { AppState } from './types'

interface StoreApi {
  getState: () => AppState
  setState: (fn: (state: AppState) => void) => void
}

/** Moves the mesh files that old saves carry inside the project (as data
 *  URLs, in localStorage) to the file store. A file only leaves the project
 *  once it is safely stored; if that fails it stays where it was. */
async function adoptEmbeddedFiles(store: StoreApi): Promise<void> {
  const pending = store
    .getState()
    .projects.flatMap((p) =>
      p.meshes.filter((m) => m.data && !m.hash).map((m) => ({ pid: p.id, mesh: m })),
    )
  if (!pending.length || !(await filesAreKept())) return
  for (const { pid, mesh } of pending) {
    try {
      const data = dataUrlBytes(mesh.data!)
      const hash = await putFile(data)
      store.setState((state) => {
        const saved = state.projects.find((p) => p.id === pid)?.meshes.find((m) => m.id === mesh.id)
        if (!saved) return
        saved.hash = hash
        saved.bytes = data.byteLength
        saved.data = null
      })
    } catch (e) {
      console.error('[mesh-studio] could not move a mesh file to the file store:', e)
      store
        .getState()
        .notify(
          'Some mesh files could not be moved to the new file storage. They stay saved as before; export your projects to keep a copy.',
        )
      return
    }
  }
}

/** Frees the stored files that no project uses any more (deleted meshes
 *  and projects). Not when the saved projects could not be read: then
 *  nothing would seem to be in use. */
async function dropOrphanFiles(store: StoreApi): Promise<void> {
  if (!savedProjectsWereRead()) return
  const used = new Set<string>()
  for (const project of store.getState().projects) {
    for (const mesh of project.meshes) if (mesh.hash) used.add(mesh.hash)
  }
  await dropUnusedFiles(used, 24 * 60 * 60 * 1000)
  await dropUnusedThumbs(used)
}

export async function runStartupTasks(store: StoreApi): Promise<void> {
  try {
    await adoptEmbeddedFiles(store)
    await dropOrphanFiles(store)
  } catch (e) {
    console.error('[mesh-studio] startup tasks failed:', e)
  }
}
