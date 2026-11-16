import { describe, expect, it } from 'vitest'

import { normalizeProject } from '@/lib/migrations'
import { validStageView } from './navigationSlice'
import type { StageView } from './types'
import type { Stage } from '@/types/project'

function stage(): Stage {
  const p = normalizeProject({
    id: 'p',
    name: 'Test',
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'm1', kind: 'mesh', meshId: 'file' },
        { id: 'a1', kind: 'assembly', label: 'Assembly 1' },
        { id: 'an', kind: 'animation', label: 'Animation 1' },
      ],
      edges: [
        { from: 'm1', to: 'a1' },
        { from: 'a1', to: 'an' },
      ],
    },
    stages: {
      an: {
        kind: 'animation',
        members: [{ nodeId: 'a1' }],
        tracks: [{ id: 't1', targetKind: 'mesh', nodeId: 'a1', actions: [{ id: 'x1' }] }],
      },
    },
  })
  const s = p?.stages.an
  if (!s) throw new Error('fixture did not normalize')
  return s
}

const left: StageView = {
  asmOpen: ['a1'],
  worldSelId: 'a1/m1',
  playT: 1.5,
  selection: { trackId: 't1', actionId: 'init' },
  orbit: { pos: [1, 2, 3], target: [0, 0, 0] },
}

describe('validStageView', () => {
  it('gives a stage back as it was left', () => {
    expect(validStageView(left, stage())).toEqual(left)
  })

  it('starts clean for a stage never left before', () => {
    expect(validStageView(undefined, stage())).toEqual({
      asmOpen: [],
      worldSelId: null,
      playT: 0,
      selection: null,
      orbit: null,
    })
  })

  it('forgets locks and selections of inputs the stage no longer has', () => {
    const s = stage()
    s.members = []
    const view = validStageView(left, s)
    expect(view.asmOpen).toEqual([])
    expect(view.worldSelId).toBeNull()
    expect(view.playT).toBe(1.5)
  })

  it('forgets a selected track or action that was deleted', () => {
    const gone = { ...left, selection: { trackId: 't1', actionId: 'nope' } }
    expect(validStageView(gone, stage()).selection).toBeNull()
    const s = stage()
    s.tracks = []
    expect(validStageView(left, s).selection).toBeNull()
  })

  it('does not select the camera of a stage without one', () => {
    expect(validStageView({ ...left, worldSelId: 'camera' }, stage()).worldSelId).toBeNull()
  })
})
