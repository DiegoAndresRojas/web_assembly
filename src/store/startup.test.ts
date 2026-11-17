import { beforeEach, describe, expect, it } from 'vitest'

import { clearMemoryFiles, getFile, hashOf, putFile } from '@/lib/meshFiles'
import { runMigrations } from '@/lib/migrations'
import { runStartupTasks } from './startup'
import type { AppState } from './types'

const EMBEDDED = 'data:model/stl;base64,' + btoa('solid a')

/** Just enough of the store for the startup tasks. */
function fakeStore(projects: unknown[]) {
  const said: string[] = []
  const state = {
    projects: runMigrations({ projects }).projects,
    notify: (text: string) => void said.push(text),
  } as unknown as AppState
  return {
    said,
    getState: () => state,
    setState: (fn: (s: AppState) => void) => fn(state),
  }
}

beforeEach(() => clearMemoryFiles())

describe('saves from before the file store', () => {
  it('keep their mesh files where they were when files are not kept', async () => {
    // (no IndexedDB here: files would only be held in memory, so a file
    // must not leave the saved project for it)
    const store = fakeStore([{ meshes: [{ id: 'm', name: 'a.stl', ext: 'stl', data: EMBEDDED }] }])
    await runStartupTasks(store)
    const mesh = store.getState().projects[0].meshes[0]
    expect(mesh.data).toBe(EMBEDDED)
    expect(mesh.hash).toBeNull()
    expect(store.said).toEqual([])
  })

  it('come through the migration with the file still inside', () => {
    const store = fakeStore([{ meshes: [{ id: 'm', name: 'a.stl', ext: 'stl', data: EMBEDDED }] }])
    expect(store.getState().projects[0].meshes[0]).toMatchObject({
      data: EMBEDDED,
      hash: null,
      bytes: 0,
    })
  })
})

describe('stored files nothing uses', () => {
  it('are left alone while they are recent', async () => {
    const hash = await putFile(new Uint8Array([1, 2]).buffer)
    expect(hash).toBe(await hashOf(new Uint8Array([1, 2]).buffer))
    await runStartupTasks(fakeStore([]))
    expect(await getFile(hash)).not.toBeNull()
  })
})
