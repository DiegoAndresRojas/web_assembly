// Read-only queries over a project's board graph (nodes + edges). Typed
// port of only_js/src/composables/useGraph.js.
import type { BoardEdge, BoardNode, MembersRow, Project } from '@/types/project'

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

/** {node, mesh} pairs for every mesh wired into a stage — the read-only
 *  half of what a stage's `members` list needs (pose/visibility comes from
 *  the stage record itself, keyed by node.id). */
export function membersOf(project: Project | null, stageNodeId: string): MembersRow[] {
  return meshNodesInStage(project, stageNodeId)
    .map((node) => ({ node, mesh: meshFor(project, node) }))
    .filter((row): row is MembersRow => !!row.mesh)
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
