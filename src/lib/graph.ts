// Read-only queries over a project's board graph (nodes + edges). Typed
// port of only_js/src/composables/useGraph.js.
import { relativePose } from './rigid'
import type {
  BoardEdge,
  BoardNode,
  MembersRow,
  MeshRecord,
  NodeKind,
  Pose,
  Project,
  Stage,
} from '@/types/project'

export function nodeById(project: Project | null, id: string | null): BoardNode | null {
  if (!project || !id) return null
  return project.board.nodes.find((n) => n.id === id) ?? null
}

export function meshFor(project: Project | null, node: BoardNode | null) {
  if (!project || !node || node.kind !== 'mesh' || !node.meshId) return null
  return project.meshes.find((m) => m.id === node.meshId) ?? null
}

export function meshForNodeId(project: Project | null, nodeId: string | null) {
  return meshFor(project, nodeById(project, nodeId))
}

export function edgesTouching(project: Project | null, nodeId: string): BoardEdge[] {
  if (!project) return []
  return project.board.edges.filter((e) => e.from === nodeId || e.to === nodeId)
}

/** Every input wired into a stage — the read-only half of what a stage's
 *  `members` list needs (pose/visibility comes from the stage record
 *  itself, keyed by node.id). An input is either a mesh node (`mesh` set)
 *  or an upstream assembly node (`mesh` null), whose assembled result
 *  comes in as one rigid part. */
export function membersOf(project: Project | null, stageNodeId: string): MembersRow[] {
  if (!project) return []
  const rows: MembersRow[] = []
  for (const e of project.board.edges) {
    if (e.to !== stageNodeId) continue
    const node = nodeById(project, e.from)
    if (!node) continue
    if (node.kind === 'mesh') {
      const mesh = meshFor(project, node)
      if (mesh) rows.push({ node, mesh })
    } else if (node.kind === 'assembly') {
      rows.push({ node, mesh: null })
    }
  }
  return rows
}

/** Separator in a part key: `asmNodeId/meshNodeId` addresses a mesh inside
 *  an assembly input (`asm/innerAsm/mesh` for nested ones). */
export const PART_SEP = '/'

export interface AssemblyPart {
  key: string
  node: BoardNode
  /** The part's file, or null for an assembly nested inside the input. */
  mesh: MeshRecord | null
  /** Nesting level below the assembly input (1 = direct part). */
  depth: number
  /** The part's assembled pose, local to the assembly that holds it. */
  pose: Pose
}

const IDENTITY: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

/** Every visible piece inside an assembly input, depth-first — meshes and
 *  nested assemblies (followed by their own pieces) — each individually
 *  addressable, selectable and animatable by its part key. */
export function assemblyParts(
  project: Project | null,
  asmNodeId: string,
  prefix: string = asmNodeId,
  depth = 1,
  path: Set<string> = new Set(),
): AssemblyPart[] {
  if (!project || path.has(asmNodeId)) return []
  // top-level calls are cached per project object — the store never mutates
  // one in place (immer), and playback asks for these every frame
  const top = prefix === asmNodeId && depth === 1 && path.size === 0
  if (top) {
    const hit = partsCache.get(project)?.get(asmNodeId)
    if (hit) return hit
  }
  const parts = collectParts(project, asmNodeId, prefix, depth, path)
  if (top) {
    let byAsm = partsCache.get(project)
    if (!byAsm) partsCache.set(project, (byAsm = new Map()))
    byAsm.set(asmNodeId, parts)
  }
  return parts
}

const partsCache = new WeakMap<Project, Map<string, AssemblyPart[]>>()

function collectParts(
  project: Project,
  asmNodeId: string,
  prefix: string,
  depth: number,
  path: Set<string>,
): AssemblyPart[] {
  const nextPath = new Set(path).add(asmNodeId)
  const stage = project.stages[asmNodeId]
  return membersOf(project, asmNodeId).flatMap((row) => {
    const member = stage?.members.find((m) => m.nodeId === row.node.id)
    if (member?.visible === false) return []
    const key = prefix + PART_SEP + row.node.id
    const self = { key, node: row.node, mesh: row.mesh, depth, pose: member?.pose ?? IDENTITY }
    if (row.mesh) return [self]
    // the pieces of an assembly input sit where that assembly put them,
    // unless this stage unlocked them from it
    const inner = assemblyParts(project, row.node.id, key, depth + 1, nextPath).map((part) =>
      part.depth === depth + 1
        ? { ...part, pose: partLocalPose(stage, row.node.id, part.node.id, part.pose) }
        : part,
    )
    return [self, ...inner]
  })
}

/** Where a piece of assembly input `asmId` sits relative to that assembly
 *  in `stage`: its assembled pose, or what the stage's override for it
 *  (see PartOverride) works out to. */
export function partLocalPose(
  stage: Stage | undefined,
  asmId: string,
  pieceId: string,
  assembled: Pose,
): Pose {
  const override = stage?.partOverrides?.[asmId + PART_SEP + pieceId]
  if (!override) return assembled
  if (!override.free) return override.pose
  const asmPose = stage?.members.find((m) => m.nodeId === asmId)?.pose ?? IDENTITY
  return relativePose(asmPose, override.pose)
}

/** The key one level up (`asm/inner/mesh` → `asm/inner`), or null for a
 *  top-level key. */
export function parentKey(key: string): string | null {
  const i = key.lastIndexOf(PART_SEP)
  return i < 0 ? null : key.slice(0, i)
}

/** The part a key addresses, or null for a plain (top-level) node id. */
export function partForKey(project: Project | null, key: string): AssemblyPart | null {
  const top = key.split(PART_SEP)[0]
  if (top === key) return null
  return assemblyParts(project, top).find((p) => p.key === key) ?? null
}

/** A piece's connector pose — where the assembly put it, before any
 *  animation: the stage member's pose for a top-level input, the assembled
 *  pose for a part inside an assembly input. */
export function restPoseOf(project: Project | null, stageId: string, key: string): Pose | null {
  const part = partForKey(project, key)
  if (part) return part.pose
  return project?.stages[stageId]?.members.find((m) => m.nodeId === key)?.pose ?? null
}

/** Whether a node id / part key refers to `nodeId` anywhere along it. */
export function keyRefersTo(key: string, nodeId: string): boolean {
  return key.split(PART_SEP).includes(nodeId)
}

/** Display name for a stage input or part key: the mesh file name, or the
 *  upstream stage's label. */
export function inputLabel(project: Project | null, nodeId: string | null): string {
  const last = nodeId?.split(PART_SEP).pop() ?? null
  const node = nodeById(project, last)
  if (!node) return '?'
  if (node.kind === 'mesh') return meshFor(project, node)?.name ?? '?'
  return node.label?.trim() || node.kind
}

/** Whether `toId` is reachable from `fromId` following board edges. */
function reaches(project: Project, fromId: string, toId: string): boolean {
  const seen = new Set<string>()
  const stack = [fromId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === toId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of project.board.edges) if (e.from === id) stack.push(e.to)
  }
  return false
}

/** Which stage kinds may take another stage's output as input. Only an
 *  assembly has an output: an animation takes inputs and feeds nothing. */
const STAGE_OUTPUTS: Record<string, NodeKind[]> = {
  assembly: ['assembly', 'animation'],
}

/** The directed edge to create when the user links `a` to `b` (dragged
 *  from `a`), or null if they can't be linked. Mesh ↔ stage always points
 *  mesh → stage whichever end the drag started from; stage ↔ stage follows
 *  the drag direction (or its reverse, if only that one is allowed) and
 *  never closes a cycle. */
export function edgeFor(
  project: Project,
  a: BoardNode,
  b: BoardNode,
): { from: string; to: string } | null {
  if (a.id === b.id) return null
  const aMesh = a.kind === 'mesh'
  const bMesh = b.kind === 'mesh'
  if (aMesh && bMesh) return null
  if (aMesh || bMesh) {
    return aMesh ? { from: a.id, to: b.id } : { from: b.id, to: a.id }
  }
  const allowed = (from: BoardNode, to: BoardNode) =>
    (STAGE_OUTPUTS[from.kind] ?? []).includes(to.kind) && !reaches(project, to.id, from.id)
  if (allowed(a, b)) return { from: a.id, to: b.id }
  if (allowed(b, a)) return { from: b.id, to: a.id }
  return null
}

export function degree(project: Project | null, nodeId: string): number {
  return edgesTouching(project, nodeId).length
}
