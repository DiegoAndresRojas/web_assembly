import { describe, expect, it } from 'vitest'

import { edgeFor, membersOf, nodeById, parentKey } from './graph'
import { normalizeProject } from './migrations'
import type { BoardNode, Project } from '@/types/project'

function project(edges: Array<[string, string]> = []): Project {
  const p = normalizeProject({
    id: 'p',
    name: 'Test',
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'm1', kind: 'mesh', meshId: 'file' },
        { id: 'm2', kind: 'mesh', meshId: 'file' },
        { id: 'a1', kind: 'assembly', label: 'Assembly 1' },
        { id: 'a2', kind: 'assembly', label: 'Assembly 2' },
        { id: 'an', kind: 'animation', label: 'Animation 1' },
      ],
      edges: edges.map(([from, to]) => ({ from, to })),
    },
  })
  if (!p) throw new Error('fixture did not normalize')
  return p
}

const node = (p: Project, id: string): BoardNode => {
  const n = nodeById(p, id)
  if (!n) throw new Error(`no node ${id}`)
  return n
}

describe('edgeFor', () => {
  it('always points mesh → stage, whichever end the drag started from', () => {
    const p = project()
    expect(edgeFor(p, node(p, 'm1'), node(p, 'a1'))).toEqual({ from: 'm1', to: 'a1' })
    expect(edgeFor(p, node(p, 'a1'), node(p, 'm1'))).toEqual({ from: 'm1', to: 'a1' })
  })

  it('never links two meshes, or a node to itself', () => {
    const p = project()
    expect(edgeFor(p, node(p, 'm1'), node(p, 'm2'))).toBeNull()
    expect(edgeFor(p, node(p, 'a1'), node(p, 'a1'))).toBeNull()
  })

  it('feeds an assembly into another assembly or an animation', () => {
    const p = project()
    expect(edgeFor(p, node(p, 'a1'), node(p, 'a2'))).toEqual({ from: 'a1', to: 'a2' })
    expect(edgeFor(p, node(p, 'a1'), node(p, 'an'))).toEqual({ from: 'a1', to: 'an' })
  })

  it('reverses a drag that started at the animation', () => {
    const p = project()
    expect(edgeFor(p, node(p, 'an'), node(p, 'a1'))).toEqual({ from: 'a1', to: 'an' })
  })

  it('refuses to close a cycle between assemblies', () => {
    const p = project([['a1', 'a2']])
    expect(edgeFor(p, node(p, 'a2'), node(p, 'a1'))).toEqual({ from: 'a1', to: 'a2' })
    const chained = project([
      ['a1', 'a2'],
      ['a2', 'an'],
    ])
    expect(edgeFor(chained, node(chained, 'an'), node(chained, 'a1'))).toEqual({
      from: 'a1',
      to: 'an',
    })
  })
})

describe('membersOf', () => {
  it('lists mesh inputs with their file and assembly inputs as rigid parts', () => {
    const p = project([
      ['m1', 'a2'],
      ['a1', 'a2'],
      ['m2', 'a1'],
    ])
    const rows = membersOf(p, 'a2')
    expect(rows.map((r) => r.node.id)).toEqual(['m1', 'a1'])
    expect(rows[0].mesh?.name).toBe('part.stl')
    expect(rows[1].mesh).toBeNull()
  })

  it('is empty for a stage with nothing wired in', () => {
    expect(membersOf(project(), 'a1')).toEqual([])
  })
})

describe('parentKey', () => {
  it('walks one level up a part key', () => {
    expect(parentKey('asm/inner/mesh')).toBe('asm/inner')
    expect(parentKey('asm')).toBeNull()
  })
})
