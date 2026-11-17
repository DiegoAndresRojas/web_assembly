// Schema versioning + defensive normalization for the persisted payload.
// Typed port of only_js/src/store/migrations.js — the store's Zustand
// `persist` middleware calls `run()` as its `migrate` function.
import { reconcileProject } from './stageInputs'
import { clamp, num, uid } from './utils'
import { DEFAULT_FRAME_FORMAT, isFrameFormat } from './videoFormat'
import type {
  Board,
  BoardEdge,
  BoardNode,
  Ease,
  EnvironmentPreset,
  KeypointLink,
  LightKind,
  MeshRecord,
  NodeKind,
  PartLook,
  PartOverride,
  Pose,
  Project,
  Stage,
  StageEnvironment,
  StageFloor,
  StageLight,
  StageMember,
  Step,
  TimelineAction,
  Track,
  Vec3,
} from '@/types/project'

// 2: per-node color (handed down from the library mesh) + action easing.
// 3: per-node scale + measured mesh size.
// 4: per-part visibility / opacity in stages (partLooks).
// 5: observers show only what the board wires in (manual "observing" dropped).
// 6: mesh → observer edges dropped (observers take stages only; those edges
//    came from an over-eager drop-to-link on the board).
// 7: assembly → observer edges dropped (observers play animations only).
// 8: observer nodes removed altogether (with their stages and edges); the
//    end-user player is being rebuilt as its own read-only mode.
// 9: per-stage camera frame format (16:9 until chosen otherwise).
// 10: pieces unlocked from assembly inputs (partOverrides).
// 11: tracks may start where the piece already is (initLinked).
// 12: animation cameras have a name.
// 13: animations hold the start poses of their pieces (startPoses) and
//     only take inputs — edges coming out of one are dropped.
// 14: animations have their own lighting (lights, environment, floor);
//     light tracks, and actions that change a light's intensity.
// 15: mesh files live in a store of their own (IndexedDB), keyed by the
//     hash of their contents; a mesh saved with its file inside keeps it
//     until it is moved there.
// 16: projects have a sequence of steps (steps).
// 17: the board's edges alone say what a stage takes in — stage records
//     are brought in line with them; fields nothing used are gone (union,
//     camera.tracked, mesh origin / color, member color, 'pending' links).
// zustand's persist only calls `migrate` when the stored version differs,
// so any change normalizeProject() must apply to old saves needs a bump.
export const CURRENT_VERSION = 17

const NODE_KINDS: NodeKind[] = ['mesh', 'assembly', 'animation']
export const EASES: Ease[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

function asVec3(v: unknown): Vec3 {
  const o = (v && typeof v === 'object' ? (v as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  return { x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0) }
}

export function normalizeMesh(raw: unknown): MeshRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  return {
    id: typeof m.id === 'string' && m.id ? m.id : uid(),
    name: typeof m.name === 'string' && m.name ? m.name : 'mesh',
    ext: typeof m.ext === 'string' ? m.ext.toLowerCase() : '',
    hash: typeof m.hash === 'string' && m.hash ? m.hash : null,
    bytes: Math.max(0, num(m.bytes, 0)),
    data: typeof m.data === 'string' ? m.data : null,
    size: m.size && typeof m.size === 'object' ? asVec3(m.size) : null,
  }
}

export function normalizeNode(raw: unknown): BoardNode | null {
  if (!raw || typeof raw !== 'object') return null
  const n = raw as Record<string, unknown>
  const kind = n.kind as NodeKind
  if (!NODE_KINDS.includes(kind)) return null
  return {
    id: typeof n.id === 'string' && n.id ? n.id : uid(),
    kind,
    x: num(n.x, 0),
    y: num(n.y, 0),
    meshId: kind === 'mesh' ? (typeof n.meshId === 'string' ? n.meshId : null) : null,
    label: typeof n.label === 'string' ? n.label : null,
    color: typeof n.color === 'string' ? n.color : null,
    scale: num(n.scale, 1) > 0 ? num(n.scale, 1) : 1,
  }
}

export function normalizeEdge(raw: unknown): BoardEdge | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.from !== 'string' || typeof e.to !== 'string' || !e.from || !e.to) return null
  return { id: typeof e.id === 'string' && e.id ? e.id : uid(), from: e.from, to: e.to }
}

export function normalizePose(raw: unknown): Pose {
  const p = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  return { pos: asVec3(p.pos), rot: asVec3(p.rot) }
}

export function normalizeMember(raw: unknown): StageMember | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.nodeId !== 'string' || !m.nodeId) return null
  return {
    nodeId: m.nodeId,
    visible: m.visible !== false,
    opacity: clamp(num(m.opacity, 1), 0.05, 1),
    pose: normalizePose(m.pose),
  }
}

export function normalizeLink(raw: unknown): KeypointLink | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  if (typeof l.nodeA !== 'string' || typeof l.nodeB !== 'string' || !l.nodeA || !l.nodeB)
    return null
  const axis = l.axis === 'x' || l.axis === 'z' ? l.axis : 'y'
  // (a link is solved as it is made; one saved without knowing reads as not touching)
  const state = l.state === 'solved' ? 'solved' : 'gap'
  return {
    id: typeof l.id === 'string' && l.id ? l.id : uid(),
    nodeA: l.nodeA,
    pointA: asVec3(l.pointA),
    normalA: l.normalA ? asVec3(l.normalA) : { x: 0, y: 1, z: 0 },
    nodeB: l.nodeB,
    pointB: asVec3(l.pointB),
    normalB: l.normalB ? asVec3(l.normalB) : { x: 0, y: 1, z: 0 },
    axis,
    state,
    gap: num(l.gap, 0),
  }
}

export function normalizeAction(raw: unknown): TimelineAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  return {
    id: typeof a.id === 'string' && a.id ? a.id : uid(),
    kind: 'move',
    fromPose: normalizePose(a.fromPose),
    toPose: normalizePose(a.toPose),
    fromLinked: a.fromLinked !== false,
    toLinked: !!a.toLinked,
    // ease-in-out is the smoothstep every action used before easing existed
    ease: EASES.includes(a.ease as Ease) ? (a.ease as Ease) : 'easeInOut',
    start: num(a.start, 0),
    duration: Math.max(0.1, num(a.duration, 1)),
    toIntensity:
      typeof a.toIntensity === 'number' && Number.isFinite(a.toIntensity)
        ? clamp(a.toIntensity, 0, 10)
        : null,
  }
}

export function normalizeTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const targetKind =
    t.targetKind === 'camera' ? 'camera' : t.targetKind === 'light' ? 'light' : 'mesh'
  const actions = Array.isArray(t.actions)
    ? t.actions.map(normalizeAction).filter((a): a is TimelineAction => !!a)
    : []
  return {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    targetKind,
    nodeId: targetKind !== 'camera' && typeof t.nodeId === 'string' ? t.nodeId : null,
    initPose: normalizePose(t.initPose),
    // tracks saved before this existed keep the pose they stored
    initLinked: targetKind === 'mesh' && t.initLinked === true,
    actions,
  }
}

function normalizePartLooks(raw: unknown): Record<string, PartLook> {
  const out: Record<string, PartLook> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const l = v as Record<string, unknown>
    out[key] = { visible: l.visible !== false, opacity: clamp(num(l.opacity, 1), 0.05, 1) }
  }
  return out
}

function normalizePartOverrides(raw: unknown): Record<string, PartOverride> {
  const out: Record<string, PartOverride> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    out[key] = { free: o.free === true, pose: normalizePose(o.pose) }
  }
  return out
}

function normalizeStartPoses(raw: unknown): Record<string, Pose> {
  const out: Record<string, Pose> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') out[key] = normalizePose(v)
  }
  return out
}

const LIGHT_KINDS: LightKind[] = ['ambient', 'directional', 'point', 'spot']
const ENVIRONMENTS: EnvironmentPreset[] = ['studio', 'sky', 'sunset']

function asColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback
}

export function normalizeLight(raw: unknown): StageLight | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  const kind = l.kind as LightKind
  if (!LIGHT_KINDS.includes(kind)) return null
  return {
    id: typeof l.id === 'string' && l.id ? l.id : uid(),
    kind,
    name: typeof l.name === 'string' && l.name.trim() ? l.name.trim() : 'Light',
    visible: l.visible !== false,
    color: asColor(l.color, '#ffffff'),
    intensity: clamp(num(l.intensity, 1), 0, 10),
    pose: normalizePose(l.pose),
    distance: Math.max(0, num(l.distance, 0)),
    angle: clamp(num(l.angle, 30), 1, 89),
    penumbra: clamp(num(l.penumbra, 0.4), 0, 1),
    castShadow: kind !== 'ambient' && l.castShadow === true,
  }
}

function normalizeEnvironment(raw: unknown): StageEnvironment | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (!ENVIRONMENTS.includes(e.preset as EnvironmentPreset)) return null
  return {
    preset: e.preset as EnvironmentPreset,
    intensity: clamp(num(e.intensity, 1), 0, 5),
    rotation: num(e.rotation, 0),
  }
}

function normalizeFloor(raw: unknown): StageFloor | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  return {
    visible: f.visible !== false,
    mode: f.mode === 'solid' ? 'solid' : 'shadow',
    height: num(f.height, 0),
    color: asColor(f.color, '#ffffff'),
    shadow: clamp(num(f.shadow, 0.35), 0, 1),
  }
}

function cameraName(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'Camera'
}

export function normalizeStage(raw: unknown): Stage {
  const s = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  const kind = s.kind === 'animation' ? 'animation' : 'assembly'
  const camera =
    s.camera && typeof s.camera === 'object'
      ? {
          name: cameraName((s.camera as Record<string, unknown>).name),
          pose: normalizePose((s.camera as Record<string, unknown>).pose),
        }
      : null
  const lights = Array.isArray(s.lights)
    ? s.lights.map(normalizeLight).filter((l): l is StageLight => !!l)
    : []
  // a light track only lives as long as its light
  const lightKeys = new Set(lights.map((l) => 'light:' + l.id))
  return {
    kind,
    frame: isFrameFormat(s.frame) ? s.frame : DEFAULT_FRAME_FORMAT,
    members: Array.isArray(s.members)
      ? s.members.map(normalizeMember).filter((m): m is StageMember => !!m)
      : [],
    links: Array.isArray(s.links)
      ? s.links.map(normalizeLink).filter((l): l is KeypointLink => !!l)
      : [],
    camera,
    tracks: Array.isArray(s.tracks)
      ? s.tracks
          .map(normalizeTrack)
          .filter((t): t is Track => !!t)
          .filter((t) => t.targetKind !== 'light' || lightKeys.has(t.nodeId ?? ''))
      : [],
    partLooks: normalizePartLooks(s.partLooks),
    partOverrides: normalizePartOverrides(s.partOverrides),
    startPoses: normalizeStartPoses(s.startPoses),
    lights,
    environment: normalizeEnvironment(s.environment),
    floor: normalizeFloor(s.floor),
  }
}

export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const boardRaw = (p.board && typeof p.board === 'object' ? p.board : {}) as Record<
    string,
    unknown
  >
  const nodes = Array.isArray(boardRaw.nodes)
    ? boardRaw.nodes.map(normalizeNode).filter((n): n is BoardNode => !!n)
    : []
  const edges = Array.isArray(boardRaw.edges)
    ? boardRaw.edges.map(normalizeEdge).filter((e): e is BoardEdge => !!e)
    : []
  const nodeIds = new Set(nodes.map((n) => n.id))
  const animationIds = new Set(nodes.filter((n) => n.kind === 'animation').map((n) => n.id))
  const board: Board = {
    nodes,
    // edges of nodes that no longer exist (e.g. removed node kinds) go too,
    // and so does anything coming out of an animation: it only takes inputs
    edges: edges.filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to) && !animationIds.has(e.from),
    ),
  }

  const stages: Record<string, Stage> = {}
  const rawStages = (p.stages && typeof p.stages === 'object' ? p.stages : {}) as Record<
    string,
    unknown
  >
  const stageIds = new Set(nodes.filter((n) => n.kind !== 'mesh').map((n) => n.id))
  for (const id of Object.keys(rawStages)) {
    if (stageIds.has(id)) stages[id] = normalizeStage(rawStages[id])
  }
  for (const n of nodes) {
    if (n.kind !== 'mesh' && !stages[n.id]) {
      stages[n.id] = normalizeStage({ kind: n.kind })
    }
  }

  const rawMeshes: unknown[] = Array.isArray(p.meshes) ? p.meshes : []
  const meshes = rawMeshes.map(normalizeMesh).filter((m): m is MeshRecord => !!m)
  // color used to live on the library mesh (shared by every node of that
  // file) — hand it down to each node, which now owns its color
  for (const n of nodes) {
    if (n.kind !== 'mesh' || n.color) continue
    const old = rawMeshes.find(
      (m) => !!m && typeof m === 'object' && (m as Record<string, unknown>).id === n.meshId,
    ) as Record<string, unknown> | undefined
    n.color = typeof old?.color === 'string' ? old.color : null
  }

  const project: Project = {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    name: typeof p.name === 'string' && p.name ? p.name : 'Project',
    meshes,
    board,
    stages,
    steps: normalizeSteps(p.steps, nodes),
  }
  // what a stage holds about its inputs follows the board's edges: a row
  // for each input, nothing about a piece that is not wired in any more
  reconcileProject(project)
  return project
}

/** The steps whose stage is still on the board, each stage once. */
function normalizeSteps(raw: unknown, nodes: BoardNode[]): Step[] {
  const steps: Step[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const node = nodes.find((n) => n.id === s.stageId && n.kind !== 'mesh')
    if (!node || steps.some((step) => step.stageId === node.id)) continue
    const fallback = node.label?.trim() || node.kind[0].toUpperCase() + node.kind.slice(1)
    steps.push({
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      stageId: node.id,
      title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : fallback,
      instructions: typeof s.instructions === 'string' ? s.instructions : '',
    })
  }
  return steps
}

export interface PersistedPayload {
  version: number
  projects: Project[]
}

export function runMigrations(payload: unknown): PersistedPayload {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const projects = Array.isArray(p.projects)
    ? p.projects.map(normalizeProject).filter((x): x is Project => !!x)
    : []
  return { version: CURRENT_VERSION, projects }
}
