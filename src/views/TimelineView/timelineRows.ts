// The timeline's rows in outliner order: the camera, then each stage input
// followed (for assembly inputs) by the tracks of the pieces inside it,
// indented by nesting depth. Tracks whose piece is gone go last.
import { assemblyParts, inputLabel, meshForNodeId, membersOf, PART_SEP } from '@/lib/graph'
import type { Ease, Project, Stage, Track } from '@/types/project'

export interface TimelineRow {
  track: Track
  /** The piece's node id / part key (null for the camera). */
  key: string | null
  label: string
  tag: string
  depth: number
}

export function timelineRows(project: Project, stageId: string, stage: Stage): TimelineRow[] {
  const rows: TimelineRow[] = []
  const placed = new Set<string>()
  const trackFor = (key: string) => stage.tracks.find((t) => t.nodeId === key)
  const tagFor = (key: string) =>
    meshForNodeId(project, key.split(PART_SEP).pop() ?? null)
      ?.ext.toUpperCase()
      .slice(0, 3) ?? 'ASM'
  const push = (track: Track, key: string | null, depth: number) => {
    placed.add(track.id)
    rows.push({
      track,
      key,
      depth,
      label: key ? inputLabel(project, key) : (stage.camera?.name ?? 'Camera'),
      tag: key ? tagFor(key) : 'CAM',
    })
  }

  const cam = stage.tracks.find((t) => t.targetKind === 'camera')
  if (cam) push(cam, null, 0)
  for (const row of membersOf(project, stageId)) {
    const own = trackFor(row.node.id)
    if (own) push(own, row.node.id, 0)
    if (row.mesh) continue
    for (const part of assemblyParts(project, row.node.id)) {
      const t = trackFor(part.key)
      if (t) push(t, part.key, part.depth)
    }
  }
  for (const t of stage.tracks) if (!placed.has(t.id)) push(t, t.nodeId, 0)
  return rows
}

export const EASE_LABEL: Record<Ease, string> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
}
