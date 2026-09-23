// Small helpers shared by the slice files. These operate on immer drafts
// (called from inside a `set((state) => { ... })` recipe), so mutating the
// returned objects directly is safe and expected.
import type { Draft } from 'immer'

import { normalizeStage } from '@/lib/migrations'
import type { AppState } from './types'
import type { BoardNode, Project, Stage, StageKind } from '@/types/project'

export function findProject(
  state: Draft<AppState>,
  pid: string | null,
): Draft<Project> | undefined {
  if (!pid) return undefined
  return state.projects.find((p) => p.id === pid)
}

export function findNode(
  project: Draft<Project> | undefined,
  nodeId: string | null,
): Draft<BoardNode> | undefined {
  if (!project || !nodeId) return undefined
  return project.board.nodes.find((n) => n.id === nodeId)
}

/** Returns the stage record for a board node, creating a default one the
 *  first time it's asked for. */
export function ensureStage(
  project: Draft<Project>,
  nodeId: string,
  kind: StageKind,
): Draft<Stage> {
  const existing = project.stages[nodeId]
  if (existing) return existing
  const created = normalizeStage({ kind })
  project.stages[nodeId] = created
  return project.stages[nodeId]
}

export function stageKindFromNode(
  project: Draft<Project> | undefined,
  nodeId: string | null,
): StageKind {
  const node = findNode(project, nodeId)
  if (node && node.kind !== 'mesh') return node.kind
  return 'assembly'
}
