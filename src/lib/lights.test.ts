import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  aimPose,
  DEFAULT_BOUNDS,
  intensityAtTime,
  isLightKey,
  lightIdOf,
  lightingAt,
  lightKey,
  lightsAt,
  lightSources,
  newLight,
  presetLights,
  recoverLightsFromChain,
} from './lights'
import { normalizeProject } from './migrations'
import type { Pose, Project, Track } from '@/types/project'

const pose = (x: number): Pose => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

const sun = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'directional',
  name: 'Sun',
  intensity: 1,
  pose: pose(1),
  ...over,
})

const lightTrackOf = (id: string, actions: unknown[]) => ({
  targetKind: 'light',
  nodeId: lightKey(id),
  initPose: pose(1),
  actions,
})

/** piece → asm1 → asm2 → asm3, with an animation on each assembly. */
function chain(stages: Record<string, unknown> = {}): Project {
  const p = normalizeProject({
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'piece', kind: 'mesh', meshId: 'file' },
        { id: 'asm1', kind: 'assembly' },
        { id: 'asm2', kind: 'assembly' },
        { id: 'asm3', kind: 'assembly' },
        { id: 'anim1', kind: 'animation', label: 'First' },
        { id: 'anim2', kind: 'animation', label: 'Second' },
        { id: 'anim3', kind: 'animation', label: 'Third' },
      ],
      edges: [
        { from: 'piece', to: 'asm1' },
        { from: 'asm1', to: 'asm2' },
        { from: 'asm2', to: 'asm3' },
        { from: 'asm1', to: 'anim1' },
        { from: 'asm2', to: 'anim2' },
        { from: 'asm3', to: 'anim3' },
      ],
    },
    stages,
  })
  if (!p) throw new Error('fixture did not normalize')
  return p
}

describe('light keys', () => {
  it('round-trip a light id, and are told apart from piece keys', () => {
    expect(lightIdOf(lightKey('abc'))).toBe('abc')
    expect(isLightKey(lightKey('abc'))).toBe(true)
    expect(isLightKey('asm/piece')).toBe(false)
    expect(lightIdOf('camera')).toBeNull()
  })
})

describe('aimPose', () => {
  it('turns a light so that its -Z points at the target', () => {
    const p = aimPose({ x: 3, y: 4, z: 5 }, { x: 0, y: 1, z: 0 })
    const r = THREE.MathUtils.degToRad
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(r(p.rot.x), r(p.rot.y), r(p.rot.z), 'XYZ'),
    )
    const wanted = new THREE.Vector3(-3, -3, -5).normalize()
    expect(forward.distanceTo(wanted)).toBeLessThan(1e-6)
    expect(p.pos).toEqual({ x: 3, y: 4, z: 5 })
  })
})

describe('new lights and presets', () => {
  it('names a new light apart from the ones there', () => {
    const first = newLight('spot', DEFAULT_BOUNDS, [])
    const second = newLight('spot', DEFAULT_BOUNDS, [first])
    expect(first.name).toBe('Spot')
    expect(second.name).toBe('Spot 2')
    expect(second.id).not.toBe(first.id)
  })

  it('places lights around the pieces at their scale', () => {
    const far = { center: { x: 100, y: 0, z: 0 }, radius: 0.01, minY: 0 }
    const light = newLight('directional', far, [])
    expect(Math.abs(light.pose.pos.x - 100)).toBeLessThan(0.1)
  })

  it('every preset comes with a fill and one light casting shadows', () => {
    for (const preset of ['studio', 'soft', 'dramatic'] as const) {
      const lights = presetLights(preset, DEFAULT_BOUNDS)
      expect(lights.some((l) => l.kind === 'ambient')).toBe(true)
      expect(lights.filter((l) => l.castShadow)).toHaveLength(1)
    }
  })
})

describe('lights over time', () => {
  const project = chain({
    anim1: {
      kind: 'animation',
      lights: [sun('s1', { intensity: 1 }), sun('s2', { intensity: 0.5, pose: pose(7) })],
      tracks: [
        lightTrackOf('s1', [
          { toPose: pose(5), start: 0, duration: 2, ease: 'linear', toIntensity: 3 },
          { toPose: pose(9), start: 2, duration: 1, ease: 'linear' },
        ]),
      ],
    },
  })
  const stage = project.stages.anim1
  const track = stage.tracks[0] as Track

  it('fades the intensity only through actions that change it', () => {
    expect(intensityAtTime(track, 1, 0)).toBe(1)
    expect(intensityAtTime(track, 1, 1)).toBeCloseTo(2)
    expect(intensityAtTime(track, 1, 2.5)).toBe(3)
  })

  it('gives each light its pose and intensity at a time, tracked or not', () => {
    const [s1, s2] = lightsAt(stage, 1)
    expect(s1.pose.pos.x).toBeCloseTo(3)
    expect(s1.intensity).toBeCloseTo(2)
    expect(s2).toEqual({ id: 's2', pose: pose(7), intensity: 0.5 })
  })

  it('hands lighting on as it is when the animation ends, as copies', () => {
    const taken = lightingAt(stage, 'end')
    expect(taken.lights[0].pose.pos.x).toBeCloseTo(9)
    expect(taken.lights[0].intensity).toBe(3)
    expect(taken.lights[0].id).not.toBe('s1')
  })
})

describe('lighting along the chain', () => {
  it('is only offered forward: later animations see earlier ones, never back', () => {
    const project = chain({
      anim1: { kind: 'animation', lights: [sun('a')] },
      anim3: { kind: 'animation', lights: [sun('c')] },
    })
    expect(lightSources(project, 'anim1')).toEqual([])
    expect(lightSources(project, 'anim2').map((s) => s.stageId)).toEqual(['anim1'])
    expect(lightSources(project, 'anim3').map((s) => s.stageId)).toEqual(['anim1'])
  })

  it('lists the nearest earlier animation first', () => {
    const project = chain({
      anim1: { kind: 'animation', lights: [sun('a')] },
      anim2: { kind: 'animation', environment: { preset: 'sky' } },
    })
    const sources = lightSources(project, 'anim3')
    expect(sources.map((s) => s.stageId)).toEqual(['anim2', 'anim1'])
    expect(sources[0]).toMatchObject({ stageName: 'Second', lights: 0, environment: true })
  })

  it('an unlit animation takes up the lighting of the nearest lit one', () => {
    const project = chain({
      anim1: {
        kind: 'animation',
        lights: [sun('a', { name: 'Key' })],
        floor: { mode: 'shadow', height: -2 },
      },
    })
    expect(recoverLightsFromChain(project, 'anim3')).toBe(true)
    const lit = project.stages.anim3
    expect(lit.lights.map((l) => l.name)).toEqual(['Key'])
    expect(lit.lights[0].id).not.toBe('a')
    expect(lit.floor?.height).toBe(-2)
    // copies: changing one leaves the other alone
    lit.lights[0].intensity = 9
    expect(project.stages.anim1.lights[0].intensity).toBe(1)
  })

  it('leaves an animation that has lighting of its own as it is', () => {
    const project = chain({
      anim1: { kind: 'animation', lights: [sun('a')] },
      anim2: { kind: 'animation', lights: [sun('b', { name: 'Mine' })] },
    })
    expect(recoverLightsFromChain(project, 'anim2')).toBe(false)
    expect(project.stages.anim2.lights.map((l) => l.name)).toEqual(['Mine'])
  })

  it('has nothing to take at the start of a chain', () => {
    expect(recoverLightsFromChain(chain(), 'anim1')).toBe(false)
  })
})

describe('saved lighting', () => {
  it('drops a light track whose light is gone, and keeps values in range', () => {
    const project = chain({
      anim1: {
        kind: 'animation',
        lights: [sun('a', { intensity: 99, angle: 500 })],
        tracks: [lightTrackOf('a', []), lightTrackOf('gone', [])],
      },
    })
    const stage = project.stages.anim1
    expect(stage.tracks.map((t) => t.nodeId)).toEqual([lightKey('a')])
    expect(stage.lights[0].intensity).toBe(10)
    expect(stage.lights[0].angle).toBe(89)
  })

  it('gives stages saved before lighting existed none of their own', () => {
    const stage = chain({ anim1: { kind: 'animation' } }).stages.anim1
    expect(stage.lights).toEqual([])
    expect(stage.environment).toBeNull()
    expect(stage.floor).toBeNull()
  })
})
