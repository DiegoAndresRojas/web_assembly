// What a stage takes in is said in one place only: the board's edges. A
// stage record holds things *about* its inputs — a pose and a look for
// each, keypoint links between them, tracks, start poses, pieces unlocked
// from an assembly — and all of it is keyed by input (or by the part key of
// a piece inside one).
//
// reconcileStage brings a stage record in line with the edges: an input
// that was wired in gets its row, and whatever refers to something that is
// not wired in any more goes. It runs after every change to the board's
// structure and when a project is loaded, so nothing is ever left behind
// about a piece the stage no longer has.
import { membersOf, PART_SEP } from './graph'
import type { Project, StageMember } from '@/types/project'

/** Every key that names something in a stage's scene: its inputs, and the
 *  pieces inside its assembly inputs at any depth (shown or hidden). */
export function sceneKeys(project: Project, stageId: string): Set<string> {
  const keys = new Set<string>()
  const walk = (id: string, prefix: string, path: Set<string>) => {
    for (const row of membersOf(project, id)) {
      const key = prefix ? prefix + PART_SEP + row.node.id : row.node.id
      keys.add(key)
      // (the board forbids cycles, but never recurse forever on stale data)
      if (!row.mesh && !path.has(row.node.id)) {
        walk(row.node.id, key, new Set(path).add(row.node.id))
      }
    }
  }
  walk(stageId, '', new Set([stageId]))
  return keys
}

function newMember(nodeId: string): StageMember {
  return {
    nodeId,
    visible: true,
    opacity: 1,
    pose: { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
  }
}

/** Drops the entries of `record` whose key is not in `live`. */
function prune(record: Record<string, unknown>, live: Set<string>): void {
  for (const key of Object.keys(record)) if (!live.has(key)) delete record[key]
}

/** Brings one stage record in line with the board's edges. Mutates the
 *  project (an immer draft in the store) — and only what has to change, so
 *  a stage that is already in line is left untouched. */
export function reconcileStage(project: Project, stageId: string): void {
  const stage = project.stages[stageId]
  if (!stage) return
  const inputs = membersOf(project, stageId).map((row) => row.node.id)
  const live = sceneKeys(project, stageId)

  if (stage.members.some((m) => !inputs.includes(m.nodeId))) {
    stage.members = stage.members.filter((m) => inputs.includes(m.nodeId))
  }
  for (const id of inputs) {
    if (!stage.members.some((m) => m.nodeId === id)) stage.members.push(newMember(id))
  }
  if (stage.links.some((l) => !live.has(l.nodeA) || !live.has(l.nodeB))) {
    stage.links = stage.links.filter((l) => live.has(l.nodeA) && live.has(l.nodeB))
  }
  // (camera and light tracks are not about an input)
  const dead = (t: { targetKind: string; nodeId: string | null }) =>
    t.targetKind === 'mesh' && (!t.nodeId || !live.has(t.nodeId))
  if (stage.tracks.some(dead)) stage.tracks = stage.tracks.filter((t) => !dead(t))
  prune(stage.partLooks, live)
  prune(stage.startPoses, live)
  prune(stage.partOverrides, live)
}

/** Brings every stage record of the project in line with its board. */
export function reconcileProject(project: Project): void {
  for (const stageId of Object.keys(project.stages)) reconcileStage(project, stageId)
}
