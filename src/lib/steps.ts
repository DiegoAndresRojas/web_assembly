// The assembly sequence: the ordered list of steps someone follows to put
// the product together. A step is a stage of the board — an animation, or
// an assembly shown as it stands — with a title and instructions of its
// own. The board says what feeds what; the steps say in which order it is
// told.
import { stageName } from './cameras'
import { uid } from './utils'
import type { BoardNode, Project, Step } from '@/types/project'

export function stepOf(project: Project, stageId: string): Step | null {
  return project.steps.find((s) => s.stageId === stageId) ?? null
}

export interface StepPlace {
  step: Step
  /** 1-based. */
  number: number
  total: number
  prev: Step | null
  next: Step | null
}

/** Where a stage stands among `steps`; null if it is not one of them. */
export function placeIn(steps: Step[], stageId: string): StepPlace | null {
  const i = steps.findIndex((s) => s.stageId === stageId)
  if (i < 0) return null
  return {
    step: steps[i],
    number: i + 1,
    total: steps.length,
    prev: steps[i - 1] ?? null,
    next: steps[i + 1] ?? null,
  }
}

/** Where a stage stands in the sequence; null if it is not a step. */
export function stepPlace(project: Project, stageId: string): StepPlace | null {
  return placeIn(project.steps, stageId)
}

/** How far down the chain a stage is: the longest way to it from a mesh.
 *  An animation comes right after the assemblies it plays. */
function depthOf(project: Project, nodeId: string, path: Set<string> = new Set()): number {
  if (path.has(nodeId)) return 0
  const node = project.board.nodes.find((n) => n.id === nodeId)
  if (!node || node.kind === 'mesh') return 0
  const next = new Set(path).add(nodeId)
  const inputs = project.board.edges.filter((e) => e.to === nodeId).map((e) => e.from)
  const deepest = Math.max(0, ...inputs.map((id) => depthOf(project, id, next)))
  return node.kind === 'animation' ? deepest + 0.5 : deepest + 1
}

/** The stages that are not a step yet, in the order the chain builds them. */
export function stagesWithoutStep(project: Project): BoardNode[] {
  const taken = new Set(project.steps.map((s) => s.stageId))
  return project.board.nodes
    .filter((n) => n.kind !== 'mesh' && !taken.has(n.id))
    .map((node) => ({ node, depth: depthOf(project, node.id) }))
    .sort((a, b) => a.depth - b.depth || stageName(a.node).localeCompare(stageName(b.node)))
    .map((entry) => entry.node)
}

/** Makes `stageId` the last step (a stage is a step at most once).
 *  Mutates the project — an immer draft in the store. */
export function addStep(project: Project, stageId: string): Step | null {
  const node = project.board.nodes.find((n) => n.id === stageId)
  if (!node || node.kind === 'mesh' || stepOf(project, stageId)) return null
  const step: Step = { id: uid(), stageId, title: stageName(node), instructions: '' }
  project.steps.push(step)
  return step
}

/** Moves a step `by` places along the sequence (stopping at its ends). */
export function moveStep(project: Project, stepId: string, by: number): void {
  const from = project.steps.findIndex((s) => s.id === stepId)
  if (from < 0) return
  const to = Math.max(0, Math.min(project.steps.length - 1, from + by))
  if (to === from) return
  const [step] = project.steps.splice(from, 1)
  project.steps.splice(to, 0, step)
}

/** What the viewer walks through: the project's steps — or, for a project
 *  that has none yet, its animations in the order the chain builds them. */
export function sequenceOf(project: Project): Step[] {
  if (project.steps.length) return project.steps
  return stagesWithoutStep(project)
    .filter((node) => node.kind === 'animation')
    .map((node) => ({ id: node.id, stageId: node.id, title: stageName(node), instructions: '' }))
}
