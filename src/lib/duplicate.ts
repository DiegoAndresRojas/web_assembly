// Duplicating a board node into an independent copy. Mutates the project
// it is given, so it works on an immer draft (store) and on a plain object
// (tests) alike.
import { uid } from './utils'
import type { Project, Stage } from '@/types/project'

/** How far a copy lands from its original, in board px. */
const COPY_OFFSET = 36

/** A deep copy of a stage whose links, tracks and actions carry fresh ids,
 *  so nothing in the copy can be confused with the original. (JSON rather
 *  than structuredClone: the source may be an immer draft.) */
export function cloneStage(stage: Stage): Stage {
  const copy = JSON.parse(JSON.stringify(stage)) as Stage
  for (const link of copy.links) link.id = uid()
  for (const track of copy.tracks) {
    track.id = uid()
    for (const action of track.actions) action.id = uid()
  }
  return copy
}

function nextStageLabel(project: Project, kind: 'assembly' | 'animation'): string {
  const base = kind[0].toUpperCase() + kind.slice(1) + ' '
  const taken = new Set(project.board.nodes.map((n) => n.label))
  let n = project.board.nodes.filter((node) => node.kind === kind).length + 1
  while (taken.has(base + n)) n++
  return base + n
}

/** Adds an independent copy of `nodeId` next to it and returns the copy's
 *  id (null if there is no such node).
 *
 *  - A mesh copy is a new board node of the same file, with its own color
 *    and scale, wired into nothing.
 *  - A stage copy gets its own stage record (poses, keypoint links, tracks)
 *    and is fed by the same inputs as the original — without them its
 *    contents would refer to pieces it doesn't have. What the original
 *    feeds into is left alone. */
export function duplicateNode(project: Project, nodeId: string): string | null {
  const node = project.board.nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const id = uid()
  const copy = { ...node, id, x: node.x + COPY_OFFSET, y: node.y + COPY_OFFSET }
  if (node.kind === 'mesh') {
    project.board.nodes.push(copy)
    return id
  }
  copy.label = nextStageLabel(project, node.kind)
  project.board.nodes.push(copy)
  const inputs = project.board.edges.filter((e) => e.to === nodeId)
  for (const edge of inputs) project.board.edges.push({ id: uid(), from: edge.from, to: id })
  const stage = project.stages[nodeId]
  if (stage) project.stages[id] = cloneStage(stage)
  return id
}
