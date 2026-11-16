// Mesh download and animation export. Needs the live three.js session
// (renderer/canvas + loaded objects), so it can't be a plain store action —
// views call this hook and get back plain functions to wire to buttons.
import { useCallback } from 'react'

import { isFreePart } from '@/lib/assembly'
import { triggerDownload } from '@/lib/download'
import { stageDuration } from '@/lib/timeline'
import { exportGroup, type DownloadFormat } from '@/lib/three/buildMesh'
import { captureFrames, recordWebm } from '@/lib/three/recorder'
import type { WorldSession } from '@/lib/three/worldSession'
import { aspectOf, exportSize } from '@/lib/videoFormat'
import { buildZip } from '@/lib/zip'
import { useStore } from '@/store'
import type { Stage } from '@/types/project'
import { applyStageAt } from './useWorldSession'

/** The shape a stage's video comes out in: the animation camera's frame
 *  when the stage animates one, otherwise the viewport as it is on screen
 *  (the video is then shot through the working view). */
export function videoAspect(session: WorldSession, stage: Stage): number {
  const hasCamera = stage.tracks.some((t) => t.targetKind === 'camera')
  return hasCamera ? aspectOf(stage.frame) : session.viewportAspect()
}

export function useExport(session: WorldSession | null) {
  const doDownload = useCallback(() => {
    const state = useStore.getState()
    const { pid, aid, dlFormat, projects } = state
    const project = projects.find((p) => p.id === pid)
    const stage = project && aid ? project.stages[aid] : null
    if (!session || !stage) return
    // the stage's inputs, plus the pieces released from assembly inputs
    // (stage objects of their own, keyed by part key)
    const released = Object.keys(stage.partOverrides).filter((key) => isFreePart(stage, key))
    const objects = [...stage.members.filter((m) => m.visible).map((m) => m.nodeId), ...released]
      .map((id) => session.objects.get(id))
      .filter((o): o is NonNullable<typeof o> => !!o && o.visible)
    if (!objects.length) {
      state.closeDownload()
      return
    }
    exportGroup(objects, dlFormat as DownloadFormat).then((blob) => {
      triggerDownload(blob, (project?.name ?? 'assembly').replace(/\s+/g, '-') + '.' + dlFormat)
      state.closeDownload()
    })
  }, [session])

  const doVideoExport = useCallback(() => {
    const state = useStore.getState()
    const { pid, aid, videoFormat, videoBackground, videoColor, projects } = state
    const project = projects.find((p) => p.id === pid)
    const stage = project && aid ? project.stages[aid] : null
    const duration = stage ? stageDuration(stage) : 0
    if (!project || !aid || !stage || duration <= 0) {
      state.setExportError('Nothing is animated yet.')
      return
    }
    if (!session?.renderer) {
      state.setExportError("The viewport isn't ready yet.")
      return
    }
    state.setExportBusy(true)
    state.setExportError(null)
    // playback would keep posing the pieces between captured frames
    if (state.playing) state.seekTo(state.playT)
    const fps = 30
    const { width, height } = exportSize(videoAspect(session, stage))
    const background =
      videoBackground === 'color'
        ? videoColor
        : videoBackground === 'transparent'
          ? null
          : 'workspace'
    // shot through the animation camera (its own object in the world) when
    // the stage animates one, else through the working view
    const renderFrame = (t: number) => {
      const cam = applyStageAt(session, project, aid, t)
      session.setAnimCamera(cam)
      if (!cam || !session.renderAnimCamera()) session.render()
    }
    // the render loop keeps drawing between captured frames (and a WebM
    // records whatever is on the canvas) — have it draw the same shot
    session.setLookThrough(true)
    const canvas = session.beginExport(width, height, background) ?? session.renderer.domElement
    const restore = () => {
      const s = useStore.getState()
      session.endExport()
      session.setAnimCamera(applyStageAt(session, project, aid, s.playT))
      session.setLookThrough(s.cameraView)
    }
    const done = (blob: Blob, filename: string) => {
      triggerDownload(blob, filename)
      const s = useStore.getState()
      s.setExportBusy(false)
      s.closeVideoAsk()
      restore()
    }
    const fail = (err: unknown) => {
      restore()
      useStore.getState().setExportBusy(false)
      useStore.getState().setExportError(err instanceof Error ? err.message : String(err))
    }
    if (videoFormat === 'zip') {
      captureFrames({ canvas, fps, duration, renderFrame })
        .then((frames) =>
          buildZip(
            frames.map((f, i) => ({
              name: 'frame_' + String(i).padStart(4, '0') + '.png',
              blob: f.blob,
            })),
          ),
        )
        .then((blob) => done(blob, 'animation-frames.zip'))
        .catch(fail)
    } else {
      recordWebm({ canvas, fps, duration, renderFrame })
        .then((blob) => done(blob, 'animation.webm'))
        .catch(fail)
    }
  }, [session])

  return { doDownload, doVideoExport }
}
