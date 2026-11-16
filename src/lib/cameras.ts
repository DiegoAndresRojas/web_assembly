// The animation cameras of a project, as something another animation can
// start its own camera from.
import { poseAtTime, trackDuration } from './timeline'
import type { BoardNode, Pose, Project } from '@/types/project'

export const DEFAULT_CAMERA_NAME = 'Camera'

/** The name a stage node goes by: its label, or its kind until it has one. */
export function stageName(node: BoardNode | null | undefined): string {
  if (!node) return '?'
  return node.label?.trim() || node.kind[0].toUpperCase() + node.kind.slice(1)
}

export interface CameraSource {
  /** The animation the camera belongs to. */
  stageId: string
  stageName: string
  name: string
  /** Where the camera is when its animation starts, and when it ends. */
  start: Pose
  end: Pose
}

/** Every animation camera in the project other than `exceptStageId`'s own,
 *  in board order. */
export function cameraSources(project: Project, exceptStageId: string | null): CameraSource[] {
  return project.board.nodes.flatMap((node) => {
    if (node.kind !== 'animation' || node.id === exceptStageId) return []
    const stage = project.stages[node.id]
    const track = stage?.tracks.find((t) => t.targetKind === 'camera')
    if (!stage || !track) return []
    return [
      {
        stageId: node.id,
        stageName: stageName(node),
        name: stage.camera?.name || DEFAULT_CAMERA_NAME,
        start: track.initPose,
        end: poseAtTime(track, trackDuration(track)),
      },
    ]
  })
}
