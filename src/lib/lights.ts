// The lighting of an animation stage, as plain data: lights (objects in the
// world, like the camera), an optional environment and an optional floor.
//
// A stage with no lights of its own is lit by the default lighting. Like
// start poses, lighting is handed forward along a chain of assemblies and
// never backward: an animation takes it from the nearest animation earlier
// in its chain — once, when an assembly is first wired in, or whenever the
// author imports it (see recoverLightsFromChain / lightSources).
import * as THREE from 'three'

import { stageName } from './cameras'
import { earlierAnimations } from './chain'
import { easeValue, actionEnd, poseAtTime, sortedActions, stageDuration } from './timeline'
import { uid } from './utils'
import type {
  EnvironmentPreset,
  LightKind,
  Pose,
  Project,
  Stage,
  StageEnvironment,
  StageFloor,
  StageLight,
  Track,
  Vec3,
} from '@/types/project'

// ---------- keys ----------

const LIGHT_KEY_PREFIX = 'light:'

/** A light as a selectable "piece" (worldSelId, a track's nodeId). */
export function lightKey(id: string): string {
  return LIGHT_KEY_PREFIX + id
}

export function isLightKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith(LIGHT_KEY_PREFIX)
}

export function lightIdOf(key: string | null | undefined): string | null {
  return key && isLightKey(key) ? key.slice(LIGHT_KEY_PREFIX.length) : null
}

export function lightForKey(stage: Stage | undefined, key: string | null): StageLight | undefined {
  const id = lightIdOf(key)
  return id ? stage?.lights.find((l) => l.id === id) : undefined
}

export function lightTrack(stage: Stage | undefined, lightId: string): Track | undefined {
  const key = lightKey(lightId)
  return stage?.tracks.find((t) => t.targetKind === 'light' && t.nodeId === key)
}

// ---------- kinds ----------

export const LIGHT_KINDS: LightKind[] = ['ambient', 'directional', 'point', 'spot']

export const LIGHT_KIND_LABEL: Record<LightKind, string> = {
  ambient: 'Ambient',
  directional: 'Sun',
  point: 'Bulb',
  spot: 'Spot',
}

/** Short tag for rows (like STL / ASM / CAM). */
export const LIGHT_TAG: Record<LightKind, string> = {
  ambient: 'AMB',
  directional: 'SUN',
  point: 'BLB',
  spot: 'SPT',
}

export const LIGHT_KIND_HINT: Record<LightKind, string> = {
  ambient: 'Lights everything evenly, from nowhere in particular — the fill',
  directional: 'Parallel rays from one direction, like the sun — the main light',
  point: 'Shines in every direction from one point, like a bulb',
  spot: 'A cone of light aimed at something',
}

/** Whether a light of this kind has a place / direction in the world. */
export function isPosed(kind: LightKind): boolean {
  return kind !== 'ambient'
}

/** Whether where it points matters (a bulb shines all around). */
export function isAimed(kind: LightKind): boolean {
  return kind === 'directional' || kind === 'spot'
}

export const INTENSITY_MAX = 10

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = ['studio', 'sky', 'sunset']

export const ENVIRONMENT_LABEL: Record<EnvironmentPreset, string> = {
  studio: 'Studio',
  sky: 'Open sky',
  sunset: 'Sunset',
}

export const DEFAULT_ENVIRONMENT: StageEnvironment = { preset: 'studio', intensity: 1, rotation: 0 }

// ---------- placing ----------

/** Where the pieces are, to place new lights around them. */
export interface SceneBounds {
  center: Vec3
  radius: number
  /** The lowest point of the pieces. */
  minY: number
}

export const DEFAULT_BOUNDS: SceneBounds = { center: { x: 0, y: 0, z: 0 }, radius: 2, minY: 0 }

/** The pose at `pos` that looks (shines) at `target`. */
export function aimPose(pos: Vec3, target: Vec3): Pose {
  const eye = new THREE.Vector3(pos.x, pos.y, pos.z)
  const m = new THREE.Matrix4().lookAt(
    eye,
    new THREE.Vector3(target.x, target.y, target.z),
    new THREE.Vector3(0, 1, 0),
  )
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ')
  const d = THREE.MathUtils.radToDeg
  return { pos: { ...pos }, rot: { x: d(e.x), y: d(e.y), z: d(e.z) } }
}

/** A pose `offset` scene radii away from the pieces, looking at them. */
function around(bounds: SceneBounds, offset: [number, number, number]): Pose {
  const { center, radius } = bounds
  return aimPose(
    {
      x: center.x + offset[0] * radius,
      y: center.y + offset[1] * radius,
      z: center.z + offset[2] * radius,
    },
    center,
  )
}

const DEFAULT_OFFSET: Record<LightKind, [number, number, number]> = {
  ambient: [0, 2, 0],
  directional: [1.6, 2.2, 1.8],
  point: [0.9, 1.3, 1.1],
  spot: [1.3, 2, 1.3],
}

const KIND_DEFAULTS: Record<LightKind, Pick<StageLight, 'intensity' | 'castShadow'>> = {
  ambient: { intensity: 1.1, castShadow: false },
  directional: { intensity: 1.4, castShadow: true },
  point: { intensity: 1.2, castShadow: false },
  spot: { intensity: 2, castShadow: true },
}

function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

function makeLight(
  kind: LightKind,
  name: string,
  bounds: SceneBounds,
  over: Partial<StageLight> & { at?: [number, number, number] } = {},
): StageLight {
  const { at, ...rest } = over
  return {
    id: uid(),
    kind,
    name,
    visible: true,
    color: '#ffffff',
    ...KIND_DEFAULTS[kind],
    pose: around(bounds, at ?? DEFAULT_OFFSET[kind]),
    distance: 0,
    angle: 30,
    penumbra: 0.4,
    ...rest,
  }
}

/** A new light of `kind`, placed around the pieces and aimed at them. */
export function newLight(kind: LightKind, bounds: SceneBounds, existing: StageLight[]): StageLight {
  return makeLight(
    kind,
    freeName(
      LIGHT_KIND_LABEL[kind],
      existing.map((l) => l.name),
    ),
    bounds,
  )
}

/** The fill a stage's first light comes with, so that adding one light
 *  does not leave everything it doesn't reach black. */
export function fillLight(bounds: SceneBounds): StageLight {
  return makeLight('ambient', 'Ambient', bounds, { intensity: 0.6 })
}

export type LightPreset = 'studio' | 'soft' | 'dramatic'

export const LIGHT_PRESETS: LightPreset[] = ['studio', 'soft', 'dramatic']

export const LIGHT_PRESET_LABEL: Record<LightPreset, string> = {
  studio: 'Studio — key, fill and rim',
  soft: 'Soft — even, gentle shadows',
  dramatic: 'Dramatic — one spot in the dark',
}

/** A ready-made set of lights around the pieces. */
export function presetLights(preset: LightPreset, bounds: SceneBounds): StageLight[] {
  if (preset === 'soft') {
    return [
      makeLight('ambient', 'Ambient', bounds, { intensity: 1.3 }),
      makeLight('directional', 'Top light', bounds, { intensity: 0.7, at: [0.4, 3, 0.6] }),
    ]
  }
  if (preset === 'dramatic') {
    return [
      makeLight('ambient', 'Ambient', bounds, { intensity: 0.12 }),
      makeLight('spot', 'Spot', bounds, {
        intensity: 2.6,
        angle: 28,
        penumbra: 0.5,
        at: [1.4, 2.4, 1],
      }),
      makeLight('directional', 'Rim', bounds, {
        intensity: 0.7,
        color: '#9db8ff',
        castShadow: false,
        at: [-1.5, 1.2, -2],
      }),
    ]
  }
  return [
    makeLight('ambient', 'Ambient', bounds, { intensity: 0.5 }),
    makeLight('directional', 'Key', bounds, { intensity: 1.6, at: [1.6, 2.2, 1.8] }),
    makeLight('directional', 'Fill', bounds, {
      intensity: 0.5,
      color: '#dfe8ff',
      castShadow: false,
      at: [-2, 0.8, 1.2],
    }),
    makeLight('directional', 'Rim', bounds, {
      intensity: 0.9,
      castShadow: false,
      at: [-0.6, 1.6, -2.2],
    }),
  ]
}

/** A floor right under the pieces that only shows their shadows. */
export function newFloor(bounds: SceneBounds): StageFloor {
  return { visible: true, mode: 'shadow', height: bounds.minY, color: '#ffffff', shadow: 0.35 }
}

// ---------- over time ----------

/** The intensity a light's track gives it at `t`: `base` until an action
 *  that changes it, then eased toward each action's `toIntensity`. */
export function intensityAtTime(track: Track, base: number, t: number): number {
  let value = base
  for (const action of sortedActions(track)) {
    if (action.toIntensity === null) continue
    if (t < action.start) break
    if (t >= actionEnd(action)) {
      value = action.toIntensity
      continue
    }
    const u = action.duration > 0 ? (t - action.start) / action.duration : 1
    return value + (action.toIntensity - value) * easeValue(action.ease, u)
  }
  return value
}

export interface LightFrame {
  id: string
  pose: Pose
  intensity: number
}

/** Where every light of `stage` is, and how bright, at time `t`. */
export function lightsAt(stage: Stage, t: number): LightFrame[] {
  return stage.lights.map((light) => {
    const track = lightTrack(stage, light.id)
    return {
      id: light.id,
      pose: track ? poseAtTime(track, t) : light.pose,
      intensity: track ? intensityAtTime(track, light.intensity, t) : light.intensity,
    }
  })
}

// ---------- handing lighting on ----------

export function hasLighting(stage: Stage | undefined): boolean {
  return !!stage && (stage.lights.length > 0 || !!stage.environment || !!stage.floor)
}

export interface Lighting {
  lights: StageLight[]
  environment: StageEnvironment | null
  floor: StageFloor | null
}

/** A stage's lighting as another stage would take it: the lights where
 *  they are (and as bright as they are) when the animation starts or ends,
 *  as independent copies — how they move is not copied. */
export function lightingAt(stage: Stage, at: 'start' | 'end'): Lighting {
  const frames = lightsAt(stage, at === 'end' ? stageDuration(stage) : 0)
  return {
    lights: stage.lights.map((light, i) => ({
      ...light,
      id: uid(),
      pose: { pos: { ...frames[i].pose.pos }, rot: { ...frames[i].pose.rot } },
      intensity: frames[i].intensity,
    })),
    environment: stage.environment ? { ...stage.environment } : null,
    floor: stage.floor ? { ...stage.floor } : null,
  }
}

export interface LightSource {
  stageId: string
  stageName: string
  lights: number
  environment: boolean
  floor: boolean
}

/** The animations `stageId` can take lighting from: the ones earlier in
 *  its chain of assemblies that have any, nearest first. */
export function lightSources(project: Project, stageId: string): LightSource[] {
  return earlierAnimations(project, stageId).flatMap((id) => {
    const stage = project.stages[id]
    if (!stage || !hasLighting(stage)) return []
    return [
      {
        stageId: id,
        stageName: stageName(project.board.nodes.find((n) => n.id === id)),
        lights: stage.lights.length,
        environment: !!stage.environment,
        floor: !!stage.floor,
      },
    ]
  })
}

/** Replaces a stage's lighting (its light tracks go with the lights they
 *  moved). Mutates the stage — an immer draft in the store. */
export function setLighting(stage: Stage, lighting: Lighting): void {
  stage.lights = lighting.lights
  stage.environment = lighting.environment
  stage.floor = lighting.floor
  stage.tracks = stage.tracks.filter((t) => t.targetKind !== 'light')
}

/** Has animation `stageId` take up the lighting of the nearest animation
 *  earlier in its chain that has any, as that one ends. Only for a stage
 *  with no lighting of its own yet. Mutates the project (an immer draft).
 *  Returns whether anything was taken. */
export function recoverLightsFromChain(project: Project, stageId: string): boolean {
  const stage = project.stages[stageId]
  if (!stage || hasLighting(stage)) return false
  const from = lightSources(project, stageId)[0]
  const source = from && project.stages[from.stageId]
  if (!source) return false
  setLighting(stage, lightingAt(source, 'end'))
  return true
}
