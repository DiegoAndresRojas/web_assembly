// Where the bytes of imported mesh files live: IndexedDB, one entry per
// distinct file, keyed by the hash of its contents. Projects (saved in
// localStorage) only carry the hash, so a 20 MB part costs the saved
// project a few dozen characters and the same file used twice is stored
// once.
//
// Without IndexedDB (private browsing in some browsers, tests) files are
// held in memory for the session — `filesAreKept()` says which, so the
// person can be told they would be gone on reload.
import type { MeshRecord } from '@/types/project'

const DB_NAME = 'meshstudio'
const STORE = 'files'

interface StoredFile {
  data: ArrayBuffer
  /** When it was stored — a file just added is never cleaned up as unused. */
  added: number
}

const memory = new Map<string, StoredFile>()
let opening: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = work(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = () => reject(tx.error ?? new Error('storage error'))
    tx.onabort = () => reject(tx.error ?? new Error('storage error'))
  })
}

/** Whether stored files survive a reload (false: held in memory only). */
export async function filesAreKept(): Promise<boolean> {
  return (await openDb()) !== null
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The key of a file: the SHA-256 of its contents. */
export async function hashOf(data: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    return hex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data)))
  }
  // (no Web Crypto outside secure contexts) FNV-1a over the bytes, with the
  // length: weaker, but still the same key for the same file
  const bytes = new Uint8Array(data)
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0
  return 'fnv-' + h.toString(16).padStart(8, '0') + '-' + bytes.length.toString(16)
}

let askedToPersist = false

/** Stores a file and returns its hash. Rejects when the browser refuses
 *  (out of room, storage blocked). */
export async function putFile(data: ArrayBuffer): Promise<string> {
  const hash = await hashOf(data)
  const db = await openDb()
  const file: StoredFile = { data, added: Date.now() }
  if (!db) {
    memory.set(hash, file)
    return hash
  }
  if (!askedToPersist) {
    askedToPersist = true
    // ask the browser not to evict the data of this site when the disk runs low
    void navigator.storage?.persist?.().catch(() => false)
  }
  await run(db, 'readwrite', (store) => store.put(file, hash))
  return hash
}

export async function getFile(hash: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  if (!db) return memory.get(hash)?.data ?? null
  const file = await run<StoredFile | undefined>(db, 'readonly', (store) => store.get(hash))
  return file?.data ?? null
}

/** Removes the stored files no project uses any more. Files stored in the
 *  last `graceMs` are left alone: one may be on its way into a project
 *  (an upload or an import in progress, here or in another tab). */
export async function dropUnusedFiles(
  used: ReadonlySet<string>,
  graceMs = 10 * 60 * 1000,
): Promise<number> {
  const before = Date.now() - graceMs
  const db = await openDb()
  let dropped = 0
  if (!db) {
    for (const [hash, file] of memory) {
      if (!used.has(hash) && file.added <= before && memory.delete(hash)) dropped++
    }
    return dropped
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const cursor = tx.objectStore(STORE).openCursor()
    cursor.onsuccess = () => {
      const at = cursor.result
      if (!at) return
      const file = at.value as StoredFile
      if (!used.has(String(at.key)) && file.added <= before) {
        at.delete()
        dropped++
      }
      at.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('storage error'))
    tx.onabort = () => reject(tx.error ?? new Error('storage error'))
  })
  return dropped
}

/** The bytes held in a data URL — how files were saved, inside the project
 *  itself, before they had a store of their own. */
export function dataUrlBytes(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** The contents of a library mesh's file. */
export async function meshBytes(mesh: MeshRecord): Promise<ArrayBuffer> {
  if (mesh.hash) {
    const data = await getFile(mesh.hash)
    if (!data) throw new Error(`the file of "${mesh.name}" is not in this browser any more`)
    return data
  }
  if (mesh.data) return dataUrlBytes(mesh.data)
  throw new Error(`"${mesh.name}" was saved without its file`)
}

/** The mesh formats that can be loaded. */
export const MESH_EXTS = ['glb', 'gltf', 'obj', 'stl']

export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/** "20.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' kB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** For tests: forgets every file held in memory. */
export function clearMemoryFiles(): void {
  memory.clear()
}
