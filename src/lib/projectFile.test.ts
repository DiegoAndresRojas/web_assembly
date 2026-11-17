import { beforeEach, describe, expect, it } from 'vitest'

import { clearMemoryFiles, dropUnusedFiles, getFile, hashOf, meshBytes, putFile } from './meshFiles'
import { normalizeProject } from './migrations'
import { packProject, projectFileName, unpackProject } from './projectFile'
import { buildZip, readZip } from './zip'
import type { Project } from '@/types/project'

const bytes = (...values: number[]) => new Uint8Array(values).buffer
const text = (data: ArrayBuffer) => new TextDecoder().decode(data)

/** "solid a" as a data URL: how files were saved before the file store. */
const EMBEDDED = 'data:model/stl;base64,' + btoa('solid a')

beforeEach(() => clearMemoryFiles())

describe('zip files', () => {
  it('reads back what was written, entry by entry', async () => {
    const zip = await buildZip([
      { name: 'project.json', blob: new Blob(['{"a":1}']) },
      { name: 'files/abc', blob: new Blob([bytes(0, 1, 2, 255)]) },
      { name: 'empty', blob: new Blob([]) },
    ])
    const files = await readZip(zip)
    expect(files.map((f) => f.name)).toEqual(['project.json', 'files/abc', 'empty'])
    expect(text(await files[0].read())).toBe('{"a":1}')
    expect(Array.from(new Uint8Array(await files[1].read()))).toEqual([0, 1, 2, 255])
    expect((await files[2].read()).byteLength).toBe(0)
  })

  it('reads entries that were deflated by another tool', async () => {
    // "hello hello hello" zipped with compression (method 8)
    const packed = await new Response(
      new Blob(['hello hello hello']).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer()
    const stored = await buildZip([{ name: 'a.txt', blob: new Blob([packed]) }])
    const raw = new Uint8Array(await stored.arrayBuffer())
    // mark the entry as deflated in its central record (method at +10)
    const view = new DataView(raw.buffer)
    for (let i = 0; i < raw.length - 4; i++) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 10, 8, true)
    }
    const [file] = await readZip(new Blob([raw]))
    expect(text(await file.read())).toBe('hello hello hello')
  })

  it('refuses what is not a zip file', async () => {
    await expect(readZip(new Blob(['just some text']))).rejects.toThrow('not a zip file')
  })
})

describe('the file store', () => {
  it('keeps a file under the hash of its contents, once', async () => {
    const a = await putFile(bytes(1, 2, 3))
    const b = await putFile(bytes(1, 2, 3))
    expect(a).toBe(b)
    expect(a).toBe(await hashOf(bytes(1, 2, 3)))
    expect(Array.from(new Uint8Array((await getFile(a))!))).toEqual([1, 2, 3])
    expect(await getFile('nothing')).toBeNull()
  })

  it('drops the files nothing uses, but never one just stored', async () => {
    const used = await putFile(bytes(1))
    const unused = await putFile(bytes(2))
    expect(await dropUnusedFiles(new Set([used]))).toBe(0)
    expect(await dropUnusedFiles(new Set([used]), -1)).toBe(1)
    expect(await getFile(used)).not.toBeNull()
    expect(await getFile(unused)).toBeNull()
  })

  it('reads a mesh from the store, or from the save that still carries it', async () => {
    const project = normalizeProject({
      meshes: [
        { id: 'new', name: 'new.stl', ext: 'stl', hash: await putFile(bytes(7)) },
        { id: 'old', name: 'old.stl', ext: 'stl', data: EMBEDDED },
        { id: 'lost', name: 'lost.stl', ext: 'stl', hash: 'gone' },
        { id: 'never', name: 'never.stl', ext: 'stl' },
      ],
    })!
    const [stored, embedded, lost, never] = project.meshes
    expect(new Uint8Array(await meshBytes(stored))[0]).toBe(7)
    expect(text(await meshBytes(embedded))).toBe('solid a')
    await expect(meshBytes(lost)).rejects.toThrow('not in this browser')
    await expect(meshBytes(never)).rejects.toThrow('without its file')
  })
})

describe('project files', () => {
  async function sample(): Promise<Project> {
    return normalizeProject({
      id: 'p1',
      name: 'Gear box / v2',
      meshes: [
        { id: 'm1', name: 'gear.stl', ext: 'stl', hash: await putFile(bytes(1, 2, 3)) },
        { id: 'm2', name: 'gear copy.stl', ext: 'stl', hash: await putFile(bytes(1, 2, 3)) },
        { id: 'm3', name: 'old.stl', ext: 'stl', data: EMBEDDED },
      ],
      board: {
        nodes: [
          { id: 'n1', kind: 'mesh', meshId: 'm1' },
          { id: 'a1', kind: 'assembly', label: 'Step one' },
        ],
        edges: [{ from: 'n1', to: 'a1' }],
      },
    })!
  }

  it('names the file after the project', async () => {
    expect(projectFileName(await sample())).toBe('Gear-box-v2.meshstudio')
  })

  it('carries a project and its mesh files to a browser that has neither', async () => {
    const project = await sample()
    const { blob, missing } = await packProject(project)
    expect(missing).toEqual([])
    // (the same file used twice travels once)
    const names = (await readZip(blob)).map((f) => f.name)
    expect(names.filter((n) => n.startsWith('files/'))).toHaveLength(2)

    clearMemoryFiles()
    const opened = await unpackProject(blob)
    expect(opened.missing).toEqual([])
    expect(opened.project.id).not.toBe('p1')
    expect(opened.project.name).toBe('Gear box / v2')
    expect(opened.project.board).toEqual(project.board)
    expect(opened.project.stages).toEqual(project.stages)
    const [gear, copy, old] = opened.project.meshes
    expect(gear.hash).toBe(copy.hash)
    expect(Array.from(new Uint8Array(await meshBytes(gear)))).toEqual([1, 2, 3])
    // a file the save still carried inside travels as a file too
    expect(old.data).toBeNull()
    expect(text(await meshBytes(old))).toBe('solid a')
  })

  it('says which meshes came without their file', async () => {
    const project = await sample()
    project.meshes[0].hash = 'gone'
    const { blob, missing } = await packProject(project)
    expect(missing).toEqual(['gear.stl'])
    const opened = await unpackProject(blob)
    expect(opened.missing).toEqual(['gear.stl'])
    expect(opened.project.meshes[0].hash).toBeNull()
    expect(opened.project.meshes[1].hash).not.toBeNull()
  })

  it('refuses a file that is not a project, or comes from a newer app', async () => {
    await expect(unpackProject(new Blob(['nope']))).rejects.toThrow('not a Mesh Studio project')
    const other = await buildZip([{ name: 'readme.txt', blob: new Blob(['hi']) }])
    await expect(unpackProject(other)).rejects.toThrow('not a Mesh Studio project')
    const newer = await buildZip([
      {
        name: 'project.json',
        blob: new Blob([
          JSON.stringify({ format: 'meshstudio-project', version: 9999, project: {} }),
        ]),
      },
    ])
    await expect(unpackProject(newer)).rejects.toThrow('newer version')
  })
})
