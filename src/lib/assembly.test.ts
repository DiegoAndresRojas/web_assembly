import { describe, expect, it } from 'vitest'

import {
  bodyPose,
  linkedBodies,
  lockPart,
  moveBodyTo,
  releasePart,
  restorePart,
  solveLink,
} from './assembly'
import { assemblyParts } from './graph'
import { normalizeLink, normalizeProject, normalizeStage } from './migrations'
import type { KeypointLink, Pose, Stage } from '@/types/project'

const pose = (x: number, y = 0, z = 0, rotY = 0): Pose => ({
  pos: { x, y, z },
  rot: { x: 0, y: rotY, z: 0 },
})
const v = (x: number, y: number, z: number) => ({ x, y, z })

function link(nodeA: string, nodeB: string, over: Partial<KeypointLink> = {}): KeypointLink {
  return { ...normalizeLink({ nodeA, nodeB })!, ...over }
}

function stage(members: Record<string, Pose>, links: KeypointLink[] = []): Stage {
  const s = normalizeStage({
    kind: 'assembly',
    members: Object.entries(members).map(([nodeId, p]) => ({ nodeId, pose: p })),
  })
  s.links = links
  return s
}

const closeTo = (actual: Pose | null, expected: Pose) => {
  expect(actual).not.toBeNull()
  for (const k of ['x', 'y', 'z'] as const) {
    expect(actual!.pos[k]).toBeCloseTo(expected.pos[k])
    expect(actual!.rot[k]).toBeCloseTo(expected.rot[k])
  }
}

describe('linkedBodies', () => {
  it('follows links through other bodies, in either direction', () => {
    const links = [link('a', 'b'), link('c', 'b'), link('x', 'y')]
    expect(linkedBodies(links, 'a').sort()).toEqual(['b', 'c'])
    expect(linkedBodies(links, 'x')).toEqual(['y'])
    expect(linkedBodies(links, 'alone')).toEqual([])
  })
})

describe('moveBodyTo', () => {
  it('moves only the body when nothing is linked to it', () => {
    const s = stage({ a: pose(0), b: pose(5) })
    moveBodyTo(s, 'a', pose(2))
    closeTo(bodyPose(s, 'a'), pose(2))
    closeTo(bodyPose(s, 'b'), pose(5))
  })

  it('carries linked bodies along by the same translation', () => {
    const s = stage({ a: pose(0), b: pose(5), c: pose(9) }, [link('a', 'b')])
    moveBodyTo(s, 'a', pose(2, 1))
    closeTo(bodyPose(s, 'b'), pose(7, 1))
    closeTo(bodyPose(s, 'c'), pose(9))
  })

  it('swings linked bodies around the moved one when it rotates', () => {
    const s = stage({ a: pose(0), b: pose(1) }, [link('a', 'b')])
    moveBodyTo(s, 'a', pose(0, 0, 0, 90))
    // +90° about Y takes +X to -Z
    closeTo(bodyPose(s, 'b'), pose(0, 0, -1, 90))
  })

  it('keeps the keypoints of every moved body in step', () => {
    const l = link('a', 'b', { pointA: v(1, 0, 0), pointB: v(1, 0, 0) })
    const s = stage({ a: pose(0), b: pose(1) }, [l])
    moveBodyTo(s, 'b', pose(4))
    expect(s.links[0].pointA.x).toBeCloseTo(4)
    expect(s.links[0].pointB.x).toBeCloseTo(4)
  })
})

describe('solveLink', () => {
  it('slides B so the two keypoints meet', () => {
    const l = link('a', 'b', {
      pointA: v(1, 0, 0),
      normalA: v(1, 0, 0),
      pointB: v(5, 0, 0),
      normalB: v(-1, 0, 0),
    })
    const s = stage({ a: pose(0), b: pose(6) }, [l])
    solveLink(s, l)
    closeTo(bodyPose(s, 'b'), pose(2))
    closeTo(bodyPose(s, 'a'), pose(0))
    expect(l.state).toBe('solved')
    expect(l.pointB.x).toBeCloseTo(1)
  })

  it('turns B about the axis so the faces look at each other', () => {
    const l = link('a', 'b', {
      pointA: v(1, 0, 0),
      normalA: v(1, 0, 0),
      pointB: v(6, 0, 1),
      normalB: v(0, 0, 1),
    })
    const s = stage({ a: pose(0), b: pose(6) }, [l])
    solveLink(s, l)
    expect(l.normalB.x).toBeCloseTo(-1)
    expect(l.pointB.x).toBeCloseTo(1)
    expect(l.pointB.z).toBeCloseTo(0)
  })

  it('brings along what was already linked to B', () => {
    const first = link('b', 'c')
    const second = link('a', 'b', { pointA: v(0, 0, 0), normalA: v(1, 0, 0), pointB: v(10, 0, 0) })
    second.normalB = v(-1, 0, 0)
    const s = stage({ a: pose(0), b: pose(10), c: pose(12) }, [first, second])
    solveLink(s, second)
    closeTo(bodyPose(s, 'b'), pose(0))
    closeTo(bodyPose(s, 'c'), pose(2))
  })

  it('reports a gap when one end is not in the stage', () => {
    const l = link('a', 'ghost', { pointA: v(0, 0, 0), pointB: v(3, 0, 0) })
    const s = stage({ a: pose(0) }, [l])
    solveLink(s, l)
    expect(l.state).toBe('gap')
    expect(l.gap).toBeCloseTo(3)
  })
})

describe('unlocking a piece of an assembly input', () => {
  const key = 'asm/piece'
  const assembled = pose(1)

  it('releases the piece where it is, as a body of its own', () => {
    const s = stage({ asm: pose(10) })
    releasePart(s, key, assembled)
    closeTo(bodyPose(s, key), pose(11))
    // the assembly moving no longer takes it along
    moveBodyTo(s, 'asm', pose(20))
    closeTo(bodyPose(s, key), pose(11))
  })

  it('locks it back where it was left, relative to the assembly', () => {
    const s = stage({ asm: pose(10) })
    releasePart(s, key, assembled)
    moveBodyTo(s, key, pose(15))
    lockPart(s, key)
    expect(bodyPose(s, key)).toBeNull()
    expect(s.partOverrides[key]).toMatchObject({ free: false })
    closeTo(s.partOverrides[key].pose, pose(5))
  })

  it('hands links made on the piece over to the assembly when locked', () => {
    const s = stage({ asm: pose(0), other: pose(3) })
    releasePart(s, key, assembled)
    s.links = [link(key, 'other'), link(key, 'asm')]
    lockPart(s, key)
    expect(s.links).toHaveLength(1)
    expect(s.links[0]).toMatchObject({ nodeA: 'asm', nodeB: 'other' })
  })

  it('restores the piece as assembled and drops the links made on it', () => {
    const s = stage({ asm: pose(0), other: pose(3) })
    releasePart(s, key, assembled)
    s.links = [link(key, 'other')]
    restorePart(s, key)
    expect(s.partOverrides[key]).toBeUndefined()
    expect(s.links).toEqual([])
  })
})

describe('assemblyParts with unlocked pieces', () => {
  const project = () => {
    const p = normalizeProject({
      meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
      board: {
        nodes: [
          { id: 'piece', kind: 'mesh', meshId: 'file' },
          { id: 'asm', kind: 'assembly' },
          { id: 'top', kind: 'assembly' },
          { id: 'anim', kind: 'animation' },
        ],
        edges: [
          { from: 'piece', to: 'asm' },
          { from: 'asm', to: 'top' },
          { from: 'top', to: 'anim' },
        ],
      },
      stages: {
        asm: { kind: 'assembly', members: [{ nodeId: 'piece', pose: pose(1) }] },
        top: { kind: 'assembly', members: [{ nodeId: 'asm', pose: pose(10) }] },
      },
    })
    if (!p) throw new Error('fixture did not normalize')
    return p
  }
  const pieceIn = (p: ReturnType<typeof project>) =>
    assemblyParts(p, 'top').find((part) => part.key === 'top/asm/piece')!.pose

  it('reports the assembled pose when nothing was unlocked', () => {
    closeTo(pieceIn(project()), pose(1))
  })

  it('reports a released piece relative to the assembly it came from', () => {
    const p = project()
    releasePart(p.stages.top, 'asm/piece', pose(1))
    moveBodyTo(p.stages.top, 'asm/piece', pose(14))
    closeTo(pieceIn(p), pose(4))
  })
})
