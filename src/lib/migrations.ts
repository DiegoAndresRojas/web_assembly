// Schema versioning + defensive normalization for the persisted payload.
// Typed port of only_js/src/store/migrations.js — the store's Zustand
// `persist` middleware calls `run()` as its `migrate` function.
import { clamp, num, uid } from './utils'
import type {
  Board,
  BoardEdge,
  BoardNode,
  Ease,
  KeypointLink,
  MeshRecord,
  NodeKind,
  PartLook,
  Pose,
  Project,
  Stage,
  StageMember,
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
// zustand's persist only calls `migrate` when the stored version differs,
// so any change normalizeProject() must apply to old saves needs a bump.
export const CURRENT_VERSION = 7

const NODE_KINDS: NodeKind[] = ['mesh', 'assembly', 'observer', 'animation']
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
    origin: 'original',
    data: typeof m.data === 'string' ? m.data : null,
    color: typeof m.color === 'string' ? m.color : null,
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
    color: typeof m.color === 'string' ? m.color : null,
  }
}

export function normalizeLink(raw: unknown): KeypointLink | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  if (typeof l.nodeA !== 'string' || typeof l.nodeB !== 'string' || !l.nodeA || !l.nodeB)
    return null
  const axis = l.axis === 'x' || l.axis === 'z' ? l.axis : 'y'
  const state = l.state === 'solved' || l.state === 'gap' ? l.state : 'pending'
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
  }
}

export function normalizeTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const targetKind = t.targetKind === 'camera' ? 'camera' : 'mesh'
  const actions = Array.isArray(t.actions)
    ? t.actions.map(normalizeAction).filter((a): a is TimelineAction => !!a)
    : []
  return {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    targetKind,
    nodeId: targetKind === 'mesh' && typeof t.nodeId === 'string' ? t.nodeId : null,
    initPose: normalizePose(t.initPose),
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

export function normalizeStage(raw: unknown): Stage {
  const s = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  const kind = s.kind === 'observer' || s.kind === 'animation' ? s.kind : 'assembly'
  const camera =
    s.camera && typeof s.camera === 'object'
      ? {
          pose: normalizePose((s.camera as Record<string, unknown>).pose),
          tracked: !!(s.camera as Record<string, unknown>).tracked,
        }
      : null
  return {
    kind,
    members: Array.isArray(s.members)
      ? s.members.map(normalizeMember).filter((m): m is StageMember => !!m)
      : [],
    links: Array.isArray(s.links)
      ? s.links.map(normalizeLink).filter((l): l is KeypointLink => !!l)
      : [],
    camera,
    tracks: Array.isArray(s.tracks)
      ? s.tracks.map(normalizeTrack).filter((t): t is Track => !!t)
      : [],
    union: s.union && typeof s.union === 'object' ? (s.union as { at: number }) : null,
    partLooks: normalizePartLooks(s.partLooks),
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
  const kindOf = (id: string) => nodes.find((n) => n.id === id)?.kind
  const board: Board = {
    nodes,
    // an observer takes animations (and observers, as steps) only
    edges: edges.filter(
      (e) =>
        kindOf(e.to) !== 'observer' ||
        kindOf(e.from) === 'animation' ||
        kindOf(e.from) === 'observer',
    ),
  }

  const stages: Record<string, Stage> = {}
  const rawStages = (p.stages && typeof p.stages === 'object' ? p.stages : {}) as Record<
    string,
    unknown
  >
  for (const id of Object.keys(rawStages)) {
    stages[id] = normalizeStage(rawStages[id])
  }
  for (const n of nodes) {
    if (n.kind !== 'mesh' && !stages[n.id]) {
      stages[n.id] = normalizeStage({ kind: n.kind })
    }
  }

  const meshes = Array.isArray(p.meshes)
    ? p.meshes.map(normalizeMesh).filter((m): m is MeshRecord => !!m)
    : []
  // color used to live on the library mesh (shared by every node of that
  // file) — hand it down to each node, which now owns its color
  for (const n of nodes) {
    if (n.kind !== 'mesh' || n.color) continue
    n.color = meshes.find((m) => m.id === n.meshId)?.color ?? null
  }
  for (const m of meshes) m.color = null

  return {
    id: typeof p.id === 'string' && p.id ? p.id : uid(),
    name: typeof p.name === 'string' && p.name ? p.name : 'Project',
    meshes,
    board,
    stages,
  }
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
