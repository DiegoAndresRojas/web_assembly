import { describe, expect, it } from 'vitest'

import { poseAtTime, resolveActions, stageDuration, trackDuration } from './timeline'
import type { Pose, Stage, TimelineAction, Track } from '@/types/project'

const pose = (x: number, rotY = 0): Pose => ({
  pos: { x, y: 0, z: 0 },
  rot: { x: 0, y: rotY, z: 0 },
})

const action = (over: Partial<TimelineAction>): TimelineAction => ({
  id: 'a',
  kind: 'move',
  fromPose: pose(0),
  toPose: pose(0),
  fromLinked: false,
  toLinked: false,
  ease: 'linear',
  start: 0,
  duration: 1,
  toIntensity: null,
  ...over,
})

const track = (actions: TimelineAction[], initPose = pose(0)): Track => ({
  id: 't',
  targetKind: 'mesh',
  nodeId: 'n',
  initPose,
  initLinked: false,
  actions,
})

describe('poseAtTime', () => {
  const t = track(
    [action({ fromPose: pose(10), toPose: pose(20), start: 1, duration: 2 })],
    pose(5),
  )

  it('holds the initial pose before the first action', () => {
    expect(poseAtTime(t, 0.5).pos.x).toBe(5)
  })

  it('interpolates inside an action', () => {
    expect(poseAtTime(t, 2).pos.x).toBeCloseTo(15)
  })

  it('holds the last target after the action ends', () => {
    expect(poseAtTime(t, 10).pos.x).toBe(20)
  })

  it('blends rotations as Euler degrees so multi-turn spins survive', () => {
    const spin = track([action({ fromPose: pose(0, 0), toPose: pose(0, 720), duration: 2 })])
    expect(poseAtTime(spin, 1).rot.y).toBeCloseTo(360)
  })
})

describe('resolveActions', () => {
  it('chains a linked start from the previous action, whatever the array order', () => {
    const second = action({ id: 'b', fromLinked: true, toPose: pose(30), start: 2 })
    const first = action({ id: 'a', fromPose: pose(1), toPose: pose(9), start: 0 })
    const resolved = resolveActions(track([second, first]), null)
    expect(resolved.map((r) => r.action.id)).toEqual(['a', 'b'])
    expect(resolved[1].from.pos.x).toBe(9)
  })

  it('starts a linked first action at the initial pose', () => {
    const [only] = resolveActions(track([action({ fromLinked: true })], pose(7)), null)
    expect(only.from.pos.x).toBe(7)
  })

  it('ends a linked action at the connector pose when one is known', () => {
    const a = action({ toLinked: true, toPose: pose(3) })
    expect(resolveActions(track([a]), pose(42))[0].to.pos.x).toBe(42)
    expect(resolveActions(track([a]), null)[0].to.pos.x).toBe(3)
  })
})

describe('durations', () => {
  it('is the end of the last action across tracks', () => {
    const a = track([action({ start: 0, duration: 1 }), action({ start: 3, duration: 2 })])
    const b = track([action({ start: 1, duration: 1 })])
    expect(trackDuration(a)).toBe(5)
    const stage = { tracks: [a, b] } as Stage
    expect(stageDuration(stage)).toBe(5)
  })

  it('is zero for a stage that animates nothing', () => {
    expect(stageDuration({ tracks: [] as Track[] } as Stage)).toBe(0)
  })
})
