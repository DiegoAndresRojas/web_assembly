// Minimal store-only (uncompressed) ZIP writer — no CDN/npm zip dependency
// is warranted for zipping a handful of exported PNG frames. Typed port of
// the writer in only_js/src/features/exporting.js.

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
