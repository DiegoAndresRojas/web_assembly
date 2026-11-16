import { describe, expect, it } from 'vitest'

import { effectiveTrack, evalStageIn, stagePieces, startPoseOf } from './chain'
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

const track = (nodeId: string, actions: unknown[], over: Record<string, unknown> = {}) => ({
  targetKind: 'mesh',
  nodeId,
  initPose: pose(0),
  initLinked: true,
  actions,
  ...over,
})

const x = (p: Pose | null) => p?.pos.x

describe('startPoseOf', () => {
  it('starts every piece where its assembly put it when nothing is animated', () => {
    const p = chain()
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1'))).toBeCloseTo(10)
    expect(x(startPoseOf(p, 'anim2', 'asm2/piece2'))).toBeCloseTo(20)
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(1)
  })

  it('starts a piece mounted earlier where the previous animation left it', () => {
    const p = chain({
      anim1: { kind: 'animation', tracks: [track('asm1/piece1', [move(7)])] },
    })
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(7)
    // pieces mounted in this assembly are not that animation's business
    expect(x(startPoseOf(p, 'anim2', 'asm2/piece2'))).toBeCloseTo(20)
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1'))).toBeCloseTo(10)
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
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(1)
  })

  it('ignores an animation that moves nothing', () => {
    const p = chain({
      anim1: { kind: 'animation', tracks: [track('asm1/piece1', [])] },
    })
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(1)
  })

  it('lets the later assembly win where it re-placed the piece itself', () => {
    const p = chain({
      anim1: { kind: 'animation', tracks: [track('asm1/piece1', [move(7)])] },
    })
    p.stages.asm2.partOverrides['asm1/piece1'] = { free: false, pose: pose(3) }
    expect(x(startPoseOf(p, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(3)
  })

  it('picks up changes to the assembly instead of a stale copy', () => {
    const before = chain()
    const after = chain({
      asm1: { kind: 'assembly', members: [{ nodeId: 'piece1', pose: pose(4) }] },
    })
    expect(x(startPoseOf(before, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(1)
    expect(x(startPoseOf(after, 'anim2', 'asm2/asm1/piece1'))).toBeCloseTo(4)
  })
})

describe('tracks that start where the piece is', () => {
  const withTrack = (over: Record<string, unknown>) =>
    chain({
      anim1: { kind: 'animation', tracks: [track('asm1/piece1', [move(7)])] },
      anim2: {
        kind: 'animation',
        tracks: [track('asm2/asm1/piece1', [move(9, { start: 2 })], over)],
      },
    })

  it('begin from the inherited pose when linked', () => {
    const p = withTrack({ initLinked: true })
    expect(x(effectiveTrack(p, 'anim2', p.stages.anim2.tracks[0]).initPose)).toBeCloseTo(7)
    expect(x(evalStageIn(p, 'anim2', 0).meshes['asm2/asm1/piece1'])).toBeCloseTo(7)
    expect(x(evalStageIn(p, 'anim2', 2.5).meshes['asm2/asm1/piece1'])).toBeCloseTo(8)
  })

  it('keep their own pose when set by hand', () => {
    const p = withTrack({ initLinked: false, initPose: pose(-5) })
    expect(x(evalStageIn(p, 'anim2', 0).meshes['asm2/asm1/piece1'])).toBeCloseTo(-5)
  })

  it('treat tracks saved before linking existed as set by hand', () => {
    const p = withTrack({ initLinked: undefined, initPose: pose(-5) })
    expect(p.stages.anim2.tracks[0].initLinked).toBe(false)
  })
})

describe('stagePieces', () => {
  it('lists untracked pieces at the pose they inherit', () => {
    const p = chain({
      anim1: { kind: 'animation', tracks: [track('asm1/piece1', [move(7)])] },
    })
    const pieces = Object.fromEntries(stagePieces(p, 'anim2').map((s) => [s.key, s.start.pos.x]))
    expect(pieces['asm2/asm1/piece1']).toBeCloseTo(7)
    expect(pieces['asm2/piece2']).toBeCloseTo(20)
    expect(pieces['asm2']).toBeCloseTo(0)
  })
})
