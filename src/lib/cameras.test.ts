import { describe, expect, it } from 'vitest'

import { cameraSources, stageName } from './cameras'
import { normalizeProject } from './migrations'

const pose = (x: number) => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

const cameraTrack = (startX: number, endX?: number) => ({
  targetKind: 'camera',
  initPose: pose(startX),
  actions:
    endX === undefined
      ? []
      : [{ kind: 'move', fromLinked: true, toPose: pose(endX), start: 1, duration: 2 }],
})

function project() {
  const p = normalizeProject({
    board: {
      nodes: [
        { id: 'asm', kind: 'assembly', label: 'Base' },
        { id: 'intro', kind: 'animation', label: 'Intro' },
        { id: 'still', kind: 'animation', label: '  ' },
        { id: 'bare', kind: 'animation', label: 'No camera' },
      ],
    },
    stages: {
      intro: {
        kind: 'animation',
        camera: { pose: pose(1), name: 'Wide shot' },
        tracks: [cameraTrack(1, 8)],
      },
      still: { kind: 'animation', camera: { pose: pose(3) }, tracks: [cameraTrack(3)] },
      bare: { kind: 'animation' },
    },
  })
  if (!p) throw new Error('fixture did not normalize')
  return p
}

describe('cameraSources', () => {
  it('lists the cameras of the other animations, with where they start and end', () => {
    const sources = cameraSources(project(), 'bare')
    expect(sources.map((s) => s.stageId)).toEqual(['intro', 'still'])
    expect(sources[0]).toMatchObject({ name: 'Wide shot', stageName: 'Intro' })
    expect(sources[0].start.pos.x).toBe(1)
    expect(sources[0].end.pos.x).toBe(8)
  })

  it('gives a camera that never moves the same start and end', () => {
    const still = cameraSources(project(), null).find((s) => s.stageId === 'still')!
    expect(still.end.pos.x).toBe(3)
    expect(still.name).toBe('Camera')
  })

  it("leaves out the open animation's own camera", () => {
    expect(cameraSources(project(), 'intro').map((s) => s.stageId)).toEqual(['still'])
  })
})

describe('stageName', () => {
  it('falls back to the kind when a stage has no usable label', () => {
    const p = project()
    const node = (id: string) => p.board.nodes.find((n) => n.id === id)
    expect(stageName(node('intro'))).toBe('Intro')
    expect(stageName(node('still'))).toBe('Animation')
    expect(stageName(undefined)).toBe('?')
  })
})
