// Minimal ZIP writer (store-only, uncompressed) and reader — no npm zip
// dependency is warranted for zipping exported PNG frames and project
// files. The reader also takes deflated entries, so a project file that
// was unzipped and zipped again by hand still opens.

export interface ZipEntry {
  name: string
  blob: Blob
}

let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    crcTable = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff]
}
function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
}
function strBytes(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff)
}

interface CentralRecord {
  nameBytes: number[]
  crc: number
  size: number
  offset: number
}

export async function buildZip(files: ZipEntry[]): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = []
  const central: CentralRecord[] = []
  let offset = 0

  for (const f of files) {
    const buf = new Uint8Array(await f.blob.arrayBuffer())
    if (offset + buf.length > 0xfffffff0) throw new Error('too large for one file (over 4 GB)')
    const crc = crc32(buf)
    const nameBytes = strBytes(f.name)
    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(buf.length),
      ...u32(buf.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
    ]
    const localBytes = new Uint8Array(local)
    parts.push(localBytes, buf)
    central.push({ nameBytes, crc, size: buf.length, offset })
    offset += localBytes.length + buf.length
  }

  const centralStart = offset
  for (const c of central) {
    const rec = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(c.crc),
      ...u32(c.size),
      ...u32(c.size),
      ...u16(c.nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(c.offset),
      ...c.nameBytes,
    ]
    const recBytes = new Uint8Array(rec)
    parts.push(recBytes)
    offset += recBytes.length
  }
  const centralSize = offset - centralStart

  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(central.length),
    ...u16(central.length),
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0),
  ]
  parts.push(new Uint8Array(end))

  return new Blob(parts, { type: 'application/zip' })
}

// ---------- reading ----------

export interface ZipFile {
  name: string
  /** The entry's contents, uncompressed. */
  read: () => Promise<ArrayBuffer>
}

const END_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
/** The end record, plus the longest comment that can follow it. */
const END_MAX = 22 + 0xffff

async function view(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer())
}

/** Lists the entries of a ZIP file. Only what is asked for is read, so a
 *  large archive is never held in memory whole. Rejects if `blob` is not a
 *  ZIP file. */
export async function readZip(blob: Blob): Promise<ZipFile[]> {
  const tailStart = Math.max(0, blob.size - END_MAX)
  const tail = await view(blob, tailStart, blob.size)
  let end = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === END_SIG) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip file')
  const count = tail.getUint16(end + 10, true)
  const centralSize = tail.getUint32(end + 12, true)
  const centralStart = tail.getUint32(end + 16, true)
  if (centralStart === 0xffffffff || count === 0xffff) {
    throw new Error('zip file too large (ZIP64 is not supported)')
  }
  const central = await view(blob, centralStart, centralStart + centralSize)
  const decoder = new TextDecoder()
  const files: ZipFile[] = []
  let at = 0
  for (let n = 0; n < count; n++) {
    if (at + 46 > central.byteLength || central.getUint32(at, true) !== CENTRAL_SIG) {
      throw new Error('damaged zip file')
    }
    const method = central.getUint16(at + 10, true)
    const packedSize = central.getUint32(at + 20, true)
    const nameLen = central.getUint16(at + 28, true)
    const extraLen = central.getUint16(at + 30, true)
    const commentLen = central.getUint16(at + 32, true)
    const localStart = central.getUint32(at + 42, true)
    const name = decoder.decode(
      new Uint8Array(central.buffer, central.byteOffset + at + 46, nameLen),
    )
    at += 46 + nameLen + extraLen + commentLen
    files.push({
      name,
      async read() {
        const local = await view(blob, localStart, localStart + 30)
        const dataStart = localStart + 30 + local.getUint16(26, true) + local.getUint16(28, true)
        const packed = blob.slice(dataStart, dataStart + packedSize)
        if (method === 0) return packed.arrayBuffer()
        if (method !== 8) throw new Error('unsupported zip compression')
        const stream = packed.stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Response(stream).arrayBuffer()
      },
    })
  }
  return files
}
