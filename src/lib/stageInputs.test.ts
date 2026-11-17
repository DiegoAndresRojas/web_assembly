import { describe, expect, it } from 'vitest'

import { normalizeProject } from './migrations'
import { reconcileProject, sceneKeys } from './stageInputs'
import type { Pose, Project } from '@/types/project'

const pose = (x: number): Pose => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

const track = (nodeId: string | null, targetKind = 'mesh') => ({
  targetKind,
  nodeId,
  initPose: pose(0),
  actions: [],
})

const link = (nodeA: string, nodeB: string) => ({
  nodeA,
  nodeB,
  pointA: { x: 0, y: 0, z: 0 },
  normalA: { x: 0, y: 1, z: 0 },
  pointB: { x: 0, y: 0, z: 0 },
  normalB: { x: 0, y: 1, z: 0 },
  state: 'solved',
})

/** piece1, piece2 → asm1 → asm2 ← piece3, and an animation of asm2. */
function sample(over: { edges?: unknown[]; stages?: Record<string, unknown> } = {}): Project {
  return normalizeProject({
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'piece1', kind: 'mesh', meshId: 'file' },
        { id: 'piece2', kind: 'mesh', meshId: 'file' },
        { id: 'piece3', kind: 'mesh', meshId: 'file' },
        { id: 'asm1', kind: 'assembly' },
        { id: 'asm2', kind: 'assembly' },
        { id: 'anim', kind: 'animation' },
      ],
      edges: over.edges ?? [
        { id: 'e1', from: 'piece1', to: 'asm1' },
        { id: 'e2', from: 'piece2', to: 'asm1' },
        { id: 'e3', from: 'asm1', to: 'asm2' },
        { id: 'e4', from: 'piece3', to: 'asm2' },
        { id: 'e5', from: 'asm2', to: 'anim' },
      ],
    },
    stages: {
      asm1: {
        kind: 'assembly',
        members: [
          { nodeId: 'piece1', pose: pose(1) },
          { nodeId: 'piece2', pose: pose(2), visible: false },
        ],
        links: [link('piece1', 'piece2')],
      },
      asm2: {
        kind: 'assembly',
        members: [{ nodeId: 'asm1', pose: pose(10) }],
        partOverrides: { 'asm1/piece2': { free: false, pose: pose(4) } },
      },
      anim: {
        kind: 'animation',
        tracks: [
          track('asm2'),
          track('asm2/asm1/piece1'),
          track('asm2/asm1/piece2'),
          track(null, 'camera'),
        ],
        camera: { name: 'Camera', pose: pose(0) },
        startPoses: { 'asm2/asm1/piece2': pose(9), 'asm2/piece3': pose(8) },
        partLooks: { 'asm2/asm1/piece2': { visible: false, opacity: 1 } },
      },
      ...over.stages,
    },
  })!
}

const unwire = (project: Project, edgeId: string) => {
  project.board.edges = project.board.edges.filter((e) => e.id !== edgeId)
  reconcileProject(project)
}

describe('what a stage takes in', () => {
  it('names every piece of its scene, hidden ones too', () => {
    expect([...sceneKeys(sample(), 'anim')]).toEqual([
      'asm2',
      'asm2/asm1',
      'asm2/asm1/piece1',
      'asm2/asm1/piece2',
      'asm2/piece3',
    ])
  })

  it('gives every wired input its row, keeping the ones there as they are', () => {
    const project = sample()
    expect(project.stages.asm2.members).toEqual([
      { nodeId: 'asm1', visible: true, opacity: 1, pose: pose(10) },
      { nodeId: 'piece3', visible: true, opacity: 1, pose: pose(0) },
    ])
    expect(project.stages.anim.members.map((m) => m.nodeId)).toEqual(['asm2'])
  })

  it('leaves a project that is in line untouched', () => {
    const project = sample()
    const before = JSON.stringify(project)
    const { members, links, tracks } = project.stages.asm1
    reconcileProject(project)
    expect(JSON.stringify(project)).toBe(before)
    // (not even new arrays: nothing to undo, nothing to save)
    expect(project.stages.asm1.members).toBe(members)
    expect(project.stages.asm1.links).toBe(links)
    expect(project.stages.asm1.tracks).toBe(tracks)
  })
})

describe('unwiring an input', () => {
  it('takes what the stage held about it, and nothing else', () => {
    const project = sample()
    unwire(project, 'e2')
    const { asm1, asm2 } = project.stages
    expect(asm1.members.map((m) => m.nodeId)).toEqual(['piece1'])
    expect(asm1.links).toEqual([])
    expect(asm2.partOverrides).toEqual({})
    expect(asm2.members.map((m) => m.nodeId)).toEqual(['asm1', 'piece3'])
  })

  it('reaches the stages further down that addressed the piece', () => {
    const project = sample()
    unwire(project, 'e2')
    const { anim } = project.stages
    expect(anim.tracks.map((t) => t.nodeId)).toEqual(['asm2', 'asm2/asm1/piece1', null])
    expect(anim.startPoses).toEqual({ 'asm2/piece3': pose(8) })
    expect(anim.partLooks).toEqual({})
    expect(anim.camera).not.toBeNull()
  })

  it('takes everything inside an assembly that is unwired', () => {
    const project = sample()
    unwire(project, 'e3')
    expect([...sceneKeys(project, 'anim')]).toEqual(['asm2', 'asm2/piece3'])
    expect(project.stages.anim.tracks.map((t) => t.nodeId)).toEqual(['asm2', null])
    // (the assembly itself keeps what it holds)
    expect(project.stages.asm1.members).toHaveLength(2)
  })
})

describe('saved projects', () => {
  it('lose what was left behind about pieces no longer wired in', () => {
    const project = sample({
      edges: [
        { from: 'piece1', to: 'asm1' },
        { from: 'asm1', to: 'asm2' },
        { from: 'asm2', to: 'anim' },
      ],
    })
    expect(project.stages.asm1.members.map((m) => m.nodeId)).toEqual(['piece1'])
    expect(project.stages.asm1.links).toEqual([])
    expect(project.stages.anim.tracks.map((t) => t.nodeId)).toEqual([
      'asm2',
      'asm2/asm1/piece1',
      null,
    ])
    expect(project.stages.anim.startPoses).toEqual({})
  })

  it('come without the fields nothing used', () => {
    const project = normalizeProject({
      meshes: [{ id: 'file', name: 'a.stl', ext: 'stl', origin: 'original', color: '#ff0000' }],
      board: {
        nodes: [
          { id: 'piece', kind: 'mesh', meshId: 'file' },
          { id: 'asm', kind: 'assembly' },
          { id: 'anim', kind: 'animation' },
        ],
        edges: [
          { from: 'piece', to: 'asm' },
          { from: 'asm', to: 'anim' },
        ],
      },
      stages: {
        asm: {
          kind: 'assembly',
          union: { at: 1 },
          members: [{ nodeId: 'piece', color: '#00ff00' }],
          links: [{ ...link('piece', 'piece'), state: 'pending' }],
        },
        anim: { kind: 'animation', camera: { name: 'Shot', pose: pose(1), tracked: true } },
      },
    })!
    expect(project.meshes[0]).not.toHaveProperty('origin')
    expect(project.meshes[0]).not.toHaveProperty('color')
    // (the color a file used to carry is its board node's)
    expect(project.board.nodes[0].color).toBe('#ff0000')
    expect(project.stages.asm).not.toHaveProperty('union')
    expect(project.stages.asm.members[0]).not.toHaveProperty('color')
    expect(project.stages.asm.links[0].state).toBe('gap')
    expect(project.stages.anim.camera).toEqual({ name: 'Shot', pose: pose(1) })
  })
})
