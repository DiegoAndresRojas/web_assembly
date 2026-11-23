import { describe, expect, it } from 'vitest'

import {
  bodyPose,
  hingeOf,
  linkedBodies,
  lockPart,
  moveBodyTo,
  releasePart,
  restorePart,
  solveLink,
  turnBodyAbout,
  turnBodyTo,
  turningSide,
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

/** a at the origin, b two along X, held together at (1, 0, 0). */
function joined(): Stage {
  const first = link('a', 'b', {
    pointA: v(1, 0, 0),
    normalA: v(1, 0, 0),
    pointB: v(4, 0, 0),
    normalB: v(-1, 0, 0),
  })
  const s = stage({ a: pose(0), b: pose(5) }, [first])
  solveLink(s, s.links[0])
  return s
}

const touching = (l: KeypointLink) => {
  expect(l.state).toBe('solved')
  expect(l.pointA.x).toBeCloseTo(l.pointB.x)
  expect(l.pointA.y).toBeCloseTo(l.pointB.y)
  expect(l.pointA.z).toBeCloseTo(l.pointB.z)
}

describe('a second link between bodies already joined', () => {
  it('turns B about the first link instead of tearing it apart', () => {
    const s = joined()
    closeTo(bodyPose(s, 'b'), pose(2))
    // one up from the joint on A, one along X from it on B
    s.links.push(link('a', 'b', { pointA: v(1, 1, 0), pointB: v(2, 0, 0) }))
    solveLink(s, s.links[1])
    touching(s.links[0])
    touching(s.links[1])
    // a quarter turn about Z, about the joint
    closeTo(bodyPose(s, 'a'), pose(0))
    closeTo(bodyPose(s, 'b'), { pos: v(1, 1, 0), rot: v(0, 0, 90) })
  })

  it('leaves what the turn cannot close as a gap on the new link only', () => {
    const s = joined()
    s.links.push(link('a', 'b', { pointA: v(1, 3, 0), pointB: v(2, 0, 0) }))
    solveLink(s, s.links[1])
    touching(s.links[0])
    expect(s.links[1].state).toBe('gap')
    expect(s.links[1].gap).toBeCloseTo(2)
  })

  it('turns about the line through two links for a third', () => {
    const s = joined()
    s.links.push(link('a', 'b', { pointA: v(1, 0, 1), pointB: v(1, 0, 1) }))
    solveLink(s, s.links[1])
    // the hinge runs along Z through (1, 0, 0): the third point swings round it
    s.links.push(link('a', 'b', { pointA: v(1, 1, 0), pointB: v(2, 0, 0) }))
    solveLink(s, s.links[2])
    s.links.forEach(touching)
  })
})

describe('turning a linked body', () => {
  it('pivots on its keypoint while the other side stays', () => {
    const s = joined()
    expect(hingeOf(s, 'b')).toMatchObject({ pivot: v(1, 0, 0), fixed: 'a', turning: ['b'] })
    turnBodyTo(s, 'b', { pos: v(9, 9, 9), rot: v(0, 0, 90) })
    closeTo(bodyPose(s, 'a'), pose(0))
    closeTo(bodyPose(s, 'b'), { pos: v(1, 1, 0), rot: v(0, 0, 90) })
    touching(s.links[0])
  })

  it('takes what hangs on it along', () => {
    const s = joined()
    s.members.push({ ...s.members[1], nodeId: 'c', pose: pose(3) })
    s.links.push(link('b', 'c', { pointA: v(3, 0, 0), pointB: v(3, 0, 0) }))
    turnBodyAbout(s, 'b', v(0, 0, 90), v(1, 0, 0), turningSide(s.links, 'b', 'a'))
    closeTo(bodyPose(s, 'c'), { pos: v(1, 2, 0), rot: v(0, 0, 90) })
    s.links.forEach(touching)
  })

  it('moves as a whole when it is not linked', () => {
    const s = stage({ a: pose(0) })
    expect(hingeOf(s, 'a')).toBeNull()
    turnBodyTo(s, 'a', pose(1, 0, 0, 45))
    closeTo(bodyPose(s, 'a'), pose(1, 0, 0, 45))
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
