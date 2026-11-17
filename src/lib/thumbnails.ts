// Pictures of mesh files, wherever a piece is shown as a tile. A picture is
// made once — three.js is only loaded for it then — and kept next to the
// file, so the board and the project cards show pieces without reading
// their files again.
import { getThumb, putThumb } from './meshFiles'
import type { MeshRecord } from '@/types/project'

/** Bumped when pictures change how they look: the kept ones are then made again. */
const LOOK = 'v1'

const pictures = new Map<string, Promise<string | null>>()

/** One at a time: reading a large file is heavy enough on its own. */
let queue: Promise<unknown> = Promise.resolve()

function queued<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work)
  queue = result.catch(() => undefined)
  return result
}

/** (starts with the file's hash up to the first dot: see dropUnusedThumbs) */
function keyOf(mesh: MeshRecord, color: string | null): string {
  const file = mesh.hash ?? 'mesh:' + mesh.id
  return `${file}.${mesh.ext.toLowerCase()}.${LOOK}.${color ?? ''}`
}

async function make(mesh: MeshRecord, color: string | null, key: string): Promise<string | null> {
  // (a file still carried inside an old save has no hash to keep it under)
  const kept = mesh.hash ? await getThumb(key).catch(() => null) : null
  if (kept) return kept
  const url = await queued(async () => {
    const { renderThumbnail } = await import('./three/thumbnail')
    return renderThumbnail(mesh, color)
  })
  if (mesh.hash) void putThumb(key, url).catch(() => undefined)
  return url
}

/** A picture of the mesh in `color` (null: as the file has it), as a data
 *  URL — or null when it cannot be made (a missing or unreadable file). */
export function meshThumbnail(mesh: MeshRecord, color: string | null): Promise<string | null> {
  const key = keyOf(mesh, color)
  let picture = pictures.get(key)
  if (!picture) {
    picture = make(mesh, color, key).catch((e: unknown) => {
      console.warn('[mesh-studio] no picture for', mesh.name, e)
      return null
    })
    pictures.set(key, picture)
  }
  return picture
}
