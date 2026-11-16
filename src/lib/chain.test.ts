import { describe, expect, it } from 'vitest'

import {
  chainStartPoses,
  effectiveTrack,
  evalStageIn,
  importedPoses,
  poseSources,
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

describe('chainStartPoses — taken when an assembly is first wired in', () => {
  it('is empty when no earlier animation moved anything', () => {
    expect(chainStartPoses(chain(), 'asm2')).toEqual({})
  })

  it('takes a piece mounted earlier from where the last animation left it', () => {
    const poses = chainStartPoses(animated(), 'asm2')
    expect(Object.keys(poses)).toEqual([INNER])
    expect(x(poses[INNER])).toBeCloseTo(7)
  })

  it('follows a previous animation that flies the piece back into place', () => {
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
    expect(x(chainStartPoses(p, 'asm2')[INNER])).toBeCloseTo(1)
  })

  it('ignores an animation that moves nothing', () => {
    const p = chain({ anim1: { kind: 'animation', tracks: [track('asm1/piece1', [])] } })
    expect(chainStartPoses(p, 'asm2')).toEqual({})
  })

  it('lets the later assembly win where it re-placed the piece itself', () => {
    const p = animated()
    p.stages.asm2.partOverrides['asm1/piece1'] = { free: false, pose: pose(3) }
    expect(chainStartPoses(p, 'asm2')).toEqual({})
  })

  it('has nothing to say about the pieces of the first assembly', () => {
    expect(chainStartPoses(animated(), 'asm1')).toEqual({})
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
    // anim1 only sees asm2's pieces as something nested above its own
    expect(poseSources(p, 'anim1')).toEqual([])
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
