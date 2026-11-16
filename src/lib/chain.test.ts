import { describe, expect, it } from 'vitest'

import {
  effectiveTrack,
  evalStageIn,
  importedPoses,
  movedBy,
  poseSources,
  previousAnimation,
  recoverFromChain,
  stagePieces,
  startPoseOf,
} from './chain'
import { normalizeProject } from './migrations'
import type { Pose, Project } from '@/types/project'

const pose = (x: number): Pose => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

const move = (toX: number, over: Record<string, unknown> = {}) => ({
  kind: 'move',
  fromLinked: true,
  toLinked: false,
  toPose: pose(toX),
  start: 0,
  duration: 1,
  ...over,
})

const track = (nodeId: string, actions: unknown[], over: Record<string, unknown> = {}) => ({
  targetKind: 'mesh',
  nodeId,
  initPose: pose(0),
  initLinked: true,
  actions,
  ...over,
})

/** piece1 → asm1 → asm2 ← piece2, with an animation on each assembly:
 *  anim1 plays asm1, anim2 plays asm2. */
function chain(stages: Record<string, unknown> = {}): Project {
  const p = normalizeProject({
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'piece1', kind: 'mesh', meshId: 'file' },
        { id: 'piece2', kind: 'mesh', meshId: 'file' },
        { id: 'asm1', kind: 'assembly' },
        { id: 'asm2', kind: 'assembly' },
        { id: 'anim1', kind: 'animation' },
        { id: 'anim2', kind: 'animation' },
      ],
      edges: [
        { from: 'piece1', to: 'asm1' },
        { from: 'asm1', to: 'asm2' },
        { from: 'piece2', to: 'asm2' },
        { from: 'asm1', to: 'anim1' },
        { from: 'asm2', to: 'anim2' },
      ],
    },
    stages: {
      asm1: { kind: 'assembly', members: [{ nodeId: 'piece1', pose: pose(1) }] },
      asm2: {
        kind: 'assembly',
        members: [
          { nodeId: 'asm1', pose: pose(10) },
          { nodeId: 'piece2', pose: pose(20) },
        ],
      },
      anim1: { kind: 'animation' },
      anim2: { kind: 'animation' },
      ...stages,
    },
  })
  if (!p) throw new Error('fixture did not normalize')
  return p
}

/** The chain, with anim1 leaving piece1 at x = 7. */
const animated = (stages: Record<string, unknown> = {}) =>
  chain({
    anim1: { kind: 'animation', tracks: [track('asm1/piece1', [move(7)])] },
    ...stages,
  })

const INNER = 'asm2/asm1/piece1'
const x = (p: Pose | null | undefined) => p?.pos.x

describe('startPoseOf', () => {
  it('starts every piece where its assembly put it by default', () => {
    const p = animated()
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1'))).toBeCloseTo(10)
    expect(x(startPoseOf(p, 'anim2', 'asm2/piece2'))).toBeCloseTo(20)
    // an earlier animation changes nothing until its poses are taken
    expect(x(startPoseOf(p, 'anim2', INNER))).toBeCloseTo(1)
  })

  it('uses the start pose the animation holds for a piece', () => {
    const p = animated({ anim2: { kind: 'animation', startPoses: { [INNER]: pose(7) } } })
    expect(x(startPoseOf(p, 'anim2', INNER))).toBeCloseTo(7)
  })

  it('follows the assembly for pieces without a held start pose', () => {
    const p = chain({
      asm1: { kind: 'assembly', members: [{ nodeId: 'piece1', pose: pose(4) }] },
    })
    expect(x(startPoseOf(p, 'anim2', INNER))).toBeCloseTo(4)
  })
})

/** A track that only says where its piece starts: no actions at all. */
const placed = (nodeId: string, atX: number) =>
  track(nodeId, [], { initPose: pose(atX), initLinked: false })

describe('recoverFromChain — taking up from the animation before', () => {
  const held = (p: Project, stageId = 'anim2') => p.stages[stageId].startPoses

  it('finds the animation of the assembly feeding this one', () => {
    expect(previousAnimation(animated(), 'anim2')).toBe('anim1')
    // the first of a chain has nothing before it
    expect(previousAnimation(animated(), 'anim1')).toBeNull()
    // an animation that says nothing about any piece does not count
    expect(previousAnimation(chain(), 'anim2')).toBeNull()
  })

  it('starts a piece mounted earlier where the last animation left it', () => {
    const p = animated()
    recoverFromChain(p, 'anim2', null)
    expect(Object.keys(held(p))).toEqual([INNER])
    expect(x(held(p)[INNER])).toBeCloseTo(7)
  })

  it('counts an animation that only set where a piece starts', () => {
    const p = chain({ anim1: { kind: 'animation', tracks: [placed('asm1/piece1', 7)] } })
    recoverFromChain(p, 'anim2', null)
    expect(x(held(p)[INNER])).toBeCloseTo(7)
  })

  it('puts the whole assembly where the earlier one was shown', () => {
    // anim1 only placed its assembly at x = 50; asm2 holds asm1 at x = 10
    const p = chain({ anim1: { kind: 'animation', tracks: [placed('asm1', 50)] } })
    recoverFromChain(p, 'anim2', 'asm2')
    // so asm2 goes to 40: asm1 ends up at 50 in the world, as before
    expect(x(held(p)['asm2'])).toBeCloseTo(40)
    expect(held(p)['asm2/asm1']).toBeUndefined()
  })

  it('holds nothing for a piece the earlier animation leaves as assembled', () => {
    const p = chain({
      anim1: {
        kind: 'animation',
        tracks: [
          track('asm1/piece1', [move(0, { toLinked: true })], {
            initPose: pose(50),
            initLinked: false,
          }),
        ],
      },
    })
    recoverFromChain(p, 'anim2', null)
    expect(held(p)).toEqual({})
  })

  it('never replaces a start pose the animation already holds', () => {
    const p = animated({ anim2: { kind: 'animation', startPoses: { [INNER]: pose(-3) } } })
    recoverFromChain(p, 'anim2', null)
    expect(x(held(p)[INNER])).toBeCloseTo(-3)
  })

  it('can be kept to the piece being put on the timeline', () => {
    const p = animated()
    recoverFromChain(p, 'anim2', 'asm2/piece2')
    expect(held(p)).toEqual({})
    recoverFromChain(p, 'anim2', 'asm2/asm1')
    expect(Object.keys(held(p))).toEqual([INNER])
  })

  it('lets the later assembly win where it re-placed the piece itself', () => {
    const p = animated()
    p.stages.asm2.partOverrides['asm1/piece1'] = { free: false, pose: pose(3) }
    recoverFromChain(p, 'anim2', null)
    expect(held(p)).toEqual({})
  })

  describe('three stages deep', () => {
    /** piece1 → asm1 → asm2 → asm3, an animation on each. asm2 holds asm1
     *  at x = 10, asm3 holds asm2 at x = 100. */
    const chain3 = (stages: Record<string, unknown>) =>
      normalizeProject({
        meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
        board: {
          nodes: [
            { id: 'piece1', kind: 'mesh', meshId: 'file' },
            ...['asm1', 'asm2', 'asm3'].map((id) => ({ id, kind: 'assembly' })),
            ...['anim1', 'anim2', 'anim3'].map((id) => ({ id, kind: 'animation' })),
          ],
          edges: [
            { from: 'piece1', to: 'asm1' },
            { from: 'asm1', to: 'asm2' },
            { from: 'asm2', to: 'asm3' },
            { from: 'asm1', to: 'anim1' },
            { from: 'asm2', to: 'anim2' },
            { from: 'asm3', to: 'anim3' },
          ],
        },
        stages: {
          asm1: { kind: 'assembly', members: [{ nodeId: 'piece1', pose: pose(1) }] },
          asm2: { kind: 'assembly', members: [{ nodeId: 'asm1', pose: pose(10) }] },
          asm3: { kind: 'assembly', members: [{ nodeId: 'asm2', pose: pose(100) }] },
          anim1: { kind: 'animation', tracks: [placed('asm1', 50)] },
          anim2: { kind: 'animation' },
          anim3: { kind: 'animation' },
          ...stages,
        },
      })!

    it('takes up from the nearest animation, not the one two stages back', () => {
      const p = chain3({ anim2: { kind: 'animation', tracks: [placed('asm2', 200)] } })
      expect(previousAnimation(p, 'anim3')).toBe('anim2')
      recoverFromChain(p, 'anim3', null)
      // asm2 at 200 in the world, held at 100 inside asm3 → asm3 at 100
      expect(x(p.stages.anim3.startPoses['asm3'])).toBeCloseTo(100)
    })

    it('reaches further back when the stage in between says nothing', () => {
      const p = chain3({})
      expect(previousAnimation(p, 'anim3')).toBe('anim1')
      recoverFromChain(p, 'anim3', null)
      // asm1 at 50 in the world, held at 100 + 10 inside asm3 → asm3 at −60
      expect(x(p.stages.anim3.startPoses['asm3'])).toBeCloseTo(-60)
    })

    it('passes a position down the chain one animation at a time', () => {
      const p = chain3({})
      recoverFromChain(p, 'anim2', null) // asm2 at 40, from anim1
      expect(x(p.stages.anim2.startPoses['asm2'])).toBeCloseTo(40)
      recoverFromChain(p, 'anim3', null) // anim2 now says something
      expect(previousAnimation(p, 'anim3')).toBe('anim2')
      expect(x(p.stages.anim3.startPoses['asm3'])).toBeCloseTo(-60)
    })
  })
})

describe('importedPoses — from another animation', () => {
  it('matches a piece nested deeper here and takes where the other ends', () => {
    const poses = importedPoses(animated(), 'anim2', 'anim1', 'end')
    expect(Object.keys(poses)).toEqual([INNER])
    expect(x(poses[INNER])).toBeCloseTo(7)
  })

  it('can take where the other animation starts instead', () => {
    expect(x(importedPoses(animated(), 'anim2', 'anim1', 'start')[INNER])).toBeCloseTo(1)
  })

  it('matches every piece of two animations of the same assembly', () => {
    const p = normalizeProject({
      meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
      board: {
        nodes: [
          { id: 'piece', kind: 'mesh', meshId: 'file' },
          { id: 'asm', kind: 'assembly' },
          { id: 'a', kind: 'animation' },
          { id: 'b', kind: 'animation' },
        ],
        edges: [
          { from: 'piece', to: 'asm' },
          { from: 'asm', to: 'a' },
          { from: 'asm', to: 'b' },
        ],
      },
      stages: {
        asm: { kind: 'assembly', members: [{ nodeId: 'piece', pose: pose(1) }] },
        a: {
          kind: 'animation',
          tracks: [track('asm', [move(30)]), track('asm/piece', [move(5)])],
        },
        b: { kind: 'animation' },
      },
    })!
    const poses = importedPoses(p, 'b', 'a', 'end')
    expect(x(poses['asm'])).toBeCloseTo(30)
    expect(x(poses['asm/piece'])).toBeCloseTo(5)
  })

  it('can be kept to one piece and what is inside it', () => {
    const p = animated()
    expect(importedPoses(p, 'anim2', 'anim1', 'end', 'asm2/piece2')).toEqual({})
    expect(Object.keys(importedPoses(p, 'anim2', 'anim1', 'end', 'asm2/asm1'))).toEqual([INNER])
  })

  it('lists the animations that share pieces with the open one', () => {
    const p = animated()
    expect(poseSources(p, 'anim2')).toEqual([{ stageId: 'anim1', pieces: 1 }])
    // and the other way round: piece1 is the one piece anim1 has
    expect(poseSources(p, 'anim1')).toEqual([{ stageId: 'anim2', pieces: 1 }])
  })

  it('counts how many pieces an import would actually move', () => {
    const p = animated()
    expect(movedBy(p, 'anim2', importedPoses(p, 'anim2', 'anim1', 'end'))).toBe(1)
    // where anim1 starts is where the assembly has the piece: nothing moves
    expect(movedBy(p, 'anim2', importedPoses(p, 'anim2', 'anim1', 'start'))).toBe(0)
  })
})

describe('importedPoses — the same pieces reached through other assemblies', () => {
  /** Two assemblies fed by the same mesh node (asmB is how a duplicated
   *  assembly looks), each with its own animation. asmB sits the piece
   *  elsewhere and, in `nested`, holds it inside an inner assembly. */
  const siblings = (animB: Record<string, unknown> = {}) =>
    normalizeProject({
      meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
      board: {
        nodes: [
          { id: 'piece', kind: 'mesh', meshId: 'file' },
          { id: 'asmA', kind: 'assembly' },
          { id: 'asmB', kind: 'assembly' },
          { id: 'animA', kind: 'animation' },
          { id: 'animB', kind: 'animation' },
        ],
        edges: [
          { from: 'piece', to: 'asmA' },
          { from: 'piece', to: 'asmB' },
          { from: 'asmA', to: 'animA' },
          { from: 'asmB', to: 'animB' },
        ],
      },
      stages: {
        asmA: { kind: 'assembly', members: [{ nodeId: 'piece', pose: pose(1) }] },
        asmB: { kind: 'assembly', members: [{ nodeId: 'piece', pose: pose(2) }] },
        animA: { kind: 'animation', tracks: [track('asmA/piece', [move(7)])] },
        animB: { kind: 'animation', ...animB },
      },
    })!

  it('finds the piece although it comes through another assembly', () => {
    const p = siblings()
    expect(poseSources(p, 'animB')).toEqual([{ stageId: 'animA', pieces: 1 }])
    expect(x(importedPoses(p, 'animB', 'animA', 'end')['asmB/piece'])).toBeCloseTo(7)
  })

  it('puts it at the same place in the world when what holds it here was moved', () => {
    // animB starts with its whole assembly shifted by 100
    const p = siblings({ startPoses: { asmB: pose(100) } })
    // world x = 7 over there → 7 − 100 relative to the shifted assembly here
    expect(x(importedPoses(p, 'animB', 'animA', 'end')['asmB/piece'])).toBeCloseTo(-93)
  })

  it('finds a mesh wired straight into the other animation', () => {
    const p = siblings()
    p.board.edges.push({ id: 'direct', from: 'piece', to: 'animA' })
    p.stages.animA.members.push({
      nodeId: 'piece',
      visible: true,
      opacity: 1,
      pose: pose(40),
      color: null,
    })
    p.stages.animA.tracks = []
    // two candidates over there (direct, and inside asmA): either is the piece
    expect(Object.keys(importedPoses(p, 'animB', 'animA', 'end'))).toEqual(['asmB/piece'])
  })

  it('never moves an assembly to where another animation had a different one', () => {
    const p = siblings()
    expect(importedPoses(p, 'animB', 'animA', 'end')['asmB']).toBeUndefined()
  })
})

describe('tracks that start where the piece is', () => {
  const withTrack = (over: Record<string, unknown>) =>
    animated({
      anim2: {
        kind: 'animation',
        startPoses: { [INNER]: pose(7) },
        tracks: [track(INNER, [move(9, { start: 2 })], over)],
      },
    })

  it('begin from the held start pose when linked', () => {
    const p = withTrack({ initLinked: true })
    expect(x(effectiveTrack(p, 'anim2', p.stages.anim2.tracks[0]).initPose)).toBeCloseTo(7)
    expect(x(evalStageIn(p, 'anim2', 0).meshes[INNER])).toBeCloseTo(7)
    expect(x(evalStageIn(p, 'anim2', 2.5).meshes[INNER])).toBeCloseTo(8)
  })

  it('keep their own pose when set by hand', () => {
    const p = withTrack({ initLinked: false, initPose: pose(-5) })
    expect(x(evalStageIn(p, 'anim2', 0).meshes[INNER])).toBeCloseTo(-5)
  })

  it('treat tracks saved before linking existed as set by hand', () => {
    const p = withTrack({ initLinked: undefined, initPose: pose(-5) })
    expect(p.stages.anim2.tracks[0].initLinked).toBe(false)
  })
})

describe('stagePieces', () => {
  it('lists untracked pieces at the pose they start in', () => {
    const p = animated({ anim2: { kind: 'animation', startPoses: { [INNER]: pose(7) } } })
    const pieces = Object.fromEntries(stagePieces(p, 'anim2').map((s) => [s.key, s.start.pos.x]))
    expect(pieces[INNER]).toBeCloseTo(7)
    expect(pieces['asm2/piece2']).toBeCloseTo(20)
    expect(pieces['asm2']).toBeCloseTo(0)
  })
})

describe('animations only take inputs', () => {
  it('drops edges coming out of an animation when a project is loaded', () => {
    const p = normalizeProject({
      board: {
        nodes: [
          { id: 'asm', kind: 'assembly' },
          { id: 'anim', kind: 'animation' },
        ],
        edges: [
          { from: 'asm', to: 'anim' },
          { from: 'anim', to: 'asm' },
        ],
      },
    })!
    expect(p.board.edges.map((e) => e.from + '>' + e.to)).toEqual(['asm>anim'])
  })
})
