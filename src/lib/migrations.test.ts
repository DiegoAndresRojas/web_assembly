import { describe, expect, it } from 'vitest'

import { CURRENT_VERSION, normalizeProject, runMigrations } from './migrations'

describe('normalizeProject', () => {
  it('rejects anything that is not an object', () => {
    expect(normalizeProject(null)).toBeNull()
    expect(normalizeProject('project')).toBeNull()
  })

  it('fills in a usable project from an empty save', () => {
    const p = normalizeProject({})
    expect(p).toMatchObject({ name: 'Project', meshes: [], stages: {} })
    expect(p?.board).toEqual({ nodes: [], edges: [] })
  })

  it('creates the stage record of every stage node', () => {
    const p = normalizeProject({
      board: {
        nodes: [
          { id: 'a1', kind: 'assembly' },
          { id: 'an', kind: 'animation' },
        ],
      },
    })
    expect(p?.stages.a1.kind).toBe('assembly')
    expect(p?.stages.an.kind).toBe('animation')
  })

  it('drops removed node kinds together with their stages and edges', () => {
    const p = normalizeProject({
      board: {
        nodes: [
          { id: 'an', kind: 'animation' },
          { id: 'ob', kind: 'observer' },
        ],
        edges: [{ from: 'an', to: 'ob' }],
      },
      stages: { an: { kind: 'animation' }, ob: { kind: 'observer' } },
    })
    expect(p?.board.nodes.map((n) => n.id)).toEqual(['an'])
    expect(p?.board.edges).toEqual([])
    expect(Object.keys(p?.stages ?? {})).toEqual(['an'])
  })

  it('hands a library mesh color down to its board nodes', () => {
    const p = normalizeProject({
      meshes: [{ id: 'file', name: 'part.stl', ext: 'STL', color: '#ff0000' }],
      board: { nodes: [{ id: 'm1', kind: 'mesh', meshId: 'file' }] },
    })
    expect(p?.board.nodes[0].color).toBe('#ff0000')
    expect(p?.meshes[0]).toMatchObject({ ext: 'stl' })
    expect(p?.meshes[0]).not.toHaveProperty('color')
  })
})

describe('runMigrations', () => {
  it('stamps the current version and survives a corrupt payload', () => {
    expect(runMigrations(undefined)).toEqual({ version: CURRENT_VERSION, projects: [] })
    expect(runMigrations({ projects: [null, { name: 'Kept' }] }).projects).toHaveLength(1)
  })
})
