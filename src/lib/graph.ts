// Read-only queries over a project's board graph (nodes + edges). Typed
// port of only_js/src/composables/useGraph.js.
import type {
  BoardEdge,
  BoardNode,
  MembersRow,
  MeshRecord,
  NodeKind,
  Pose,
  Project,
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

/** Board "mesh" nodes wired into the given stage node (edge.from -> stage). */
export function meshNodesInStage(project: Project | null, stageNodeId: string): BoardNode[] {
  if (!project) return []
  const ids = new Set(project.board.edges.filter((e) => e.to === stageNodeId).map((e) => e.from))
  return project.board.nodes.filter((n) => n.kind === 'mesh' && ids.has(n.id))
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
  mesh: MeshRecord
  /** Nesting level below the assembly input (1 = direct part). */
  depth: number
  /** The part's assembled pose, local to the assembly that holds it. */
  pose: Pose
}

const IDENTITY: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

/** Every visible mesh inside an assembly input, recursing into nested
 *  assemblies — each one individually addressable (and animatable) by its
 *  part key. */
export function assemblyParts(
  project: Project | null,
  asmNodeId: string,
  prefix: string = asmNodeId,
  depth = 1,
  path: Set<string> = new Set(),
): AssemblyPart[] {
  if (!project || path.has(asmNodeId)) return []
  const nextPath = new Set(path).add(asmNodeId)
  const stage = project.stages[asmNodeId]
  return membersOf(project, asmNodeId).flatMap((row) => {
    const member = stage?.members.find((m) => m.nodeId === row.node.id)
    if (member?.visible === false) return []
    const key = prefix + PART_SEP + row.node.id
    if (!row.mesh) return assemblyParts(project, row.node.id, key, depth + 1, nextPath)
    return [{ key, node: row.node, mesh: row.mesh, depth, pose: member?.pose ?? IDENTITY }]
  })
}

/** The part a key addresses, or null for a plain (top-level) node id. */
export function partForKey(project: Project | null, key: string): AssemblyPart | null {
  const top = key.split(PART_SEP)[0]
  if (top === key) return null
  return assemblyParts(project, top).find((p) => p.key === key) ?? null
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
  return node.label ?? node.kind
}

/** Stages an observer shows: the ones toggled on in its panel plus every
 *  stage wired into it on the board. */
export function observedStageIds(project: Project | null, stageNodeId: string): string[] {
  if (!project) return []
  const ids = [...(project.stages[stageNodeId]?.observing ?? [])]
  for (const e of project.board.edges) {
    if (e.to !== stageNodeId) continue
    const from = nodeById(project, e.from)
    if (from && from.kind !== 'mesh' && !ids.includes(from.id)) ids.push(from.id)
  }
  return ids
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

/** Which stage kinds may take another stage's output as input. */
const STAGE_OUTPUTS: Record<string, NodeKind[]> = {
  assembly: ['assembly', 'animation', 'observer'],
  animation: ['observer'],
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

/** Stage node ids that a given mesh-node is wired into. */
export function stagesForMeshNode(project: Project | null, meshNodeId: string): string[] {
  if (!project) return []
  return project.board.edges.filter((e) => e.from === meshNodeId).map((e) => e.to)
}

/** Every board "mesh" node that points at a given library mesh (a file can
 *  be dragged onto the board more than once). */
export function nodesForMesh(project: Project | null, meshId: string): BoardNode[] {
  if (!project) return []
  return project.board.nodes.filter((n) => n.kind === 'mesh' && n.meshId === meshId)
}

export function degree(project: Project | null, nodeId: string): number {
  return edgesTouching(project, nodeId).length
}
