import { describe, expect, it } from 'vitest'

import { duplicateNode } from './duplicate'
import { normalizeProject } from './migrations'
import type { Project } from '@/types/project'

const pose = (x: number) => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

function project(): Project {
  const p = normalizeProject({
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'm1', kind: 'mesh', meshId: 'file', x: 10, y: 20, color: '#ff0000', scale: 100 },
        { id: 'a1', kind: 'assembly', label: 'Assembly 1' },
        { id: 'an', kind: 'animation', label: 'Animation 1' },
      ],
      edges: [
        { id: 'e1', from: 'm1', to: 'a1' },
        { id: 'e2', from: 'a1', to: 'an' },
      ],
    },
    stages: {
      a1: {
        kind: 'assembly',
        members: [{ nodeId: 'm1', visible: true, opacity: 1, pose: pose(5) }],
      },
      an: {
        kind: 'animation',
        tracks: [
          {
            id: 't1',
            targetKind: 'mesh',
            nodeId: 'a1/m1',
            initPose: pose(0),
            actions: [{ id: 'act1', kind: 'move', toPose: pose(9), start: 0, duration: 1 }],
          },
        ],
      },
    },
  })
  if (!p) throw new Error('fixture did not normalize')
  return p
}

describe('duplicateNode', () => {
  it('returns null for a node that does not exist', () => {
    expect(duplicateNode(project(), 'nope')).toBeNull()
  })

  it('copies a mesh node with its own color and scale, wired into nothing', () => {
    const p = project()
    const id = duplicateNode(p, 'm1')
    const copy = p.board.nodes.find((n) => n.id === id)
    expect(copy).toMatchObject({ kind: 'mesh', meshId: 'file', color: '#ff0000', scale: 100 })
    expect(copy?.x).not.toBe(10)
    expect(p.board.edges.some((e) => e.from === id || e.to === id)).toBe(false)
    expect(p.meshes).toHaveLength(1)
  })

  it('copies a stage with its inputs and contents, but not what it feeds', () => {
    const p = project()
    const id = duplicateNode(p, 'a1')!
    expect(p.board.nodes.find((n) => n.id === id)?.label).toBe('Assembly 2')
    expect(p.board.edges.filter((e) => e.to === id).map((e) => e.from)).toEqual(['m1'])
    expect(p.board.edges.some((e) => e.from === id)).toBe(false)
    expect(p.stages[id].members[0].pose.pos.x).toBe(5)
  })

  it('keeps the copy independent of the original', () => {
    const p = project()
    const id = duplicateNode(p, 'an')!
    const copy = p.stages[id].tracks[0]
    const original = p.stages.an.tracks[0]
    expect(copy.id).not.toBe(original.id)
    expect(copy.actions[0].id).not.toBe(original.actions[0].id)
    copy.actions[0].toPose.pos.x = 99
    expect(original.actions[0].toPose.pos.x).toBe(9)
  })

  it('never reuses a label that is already on the board', () => {
    const p = project()
    const first = duplicateNode(p, 'a1')!
    p.board.nodes = p.board.nodes.filter((n) => n.id !== 'a1')
    const second = duplicateNode(p, first)!
    expect(p.board.nodes.find((n) => n.id === second)?.label).toBe('Assembly 3')
  })
})
