// Mesh download and animation export. Needs the live three.js session
// (renderer/canvas + loaded objects), so it can't be a plain store action —
// views call this hook and get back plain functions to wire to buttons.
import { useCallback } from 'react'

import { stageDuration } from '@/lib/timeline'
import { exportGroup, type DownloadFormat } from '@/lib/three/buildMesh'
import { captureFrames, recordWebm } from '@/lib/three/recorder'
import type { WorldSession } from '@/lib/three/worldSession'
import { buildZip } from '@/lib/zip'
import { useStore } from '@/store'
import { applyStageTime } from './useWorldSession'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function useExport(session: WorldSession | null) {
  const doDownload = useCallback(() => {
    const state = useStore.getState()
    const { pid, aid, dlFormat, projects } = state
    const project = projects.find((p) => p.id === pid)
    const stage = project && aid ? project.stages[aid] : null
    if (!session || !stage) return
    const objects = stage.members
      .filter((m) => m.visible)
      .map((m) => session.getObject(m.nodeId))
      .filter((o): o is NonNullable<typeof o> => !!o)
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
    const { pid, aid, videoFormat, projects } = state
    const project = projects.find((p) => p.id === pid)
    const stage = project && aid ? project.stages[aid] : null
    const duration = stage ? stageDuration(stage) : 0
    if (!stage || duration <= 0) {
      state.setExportError('Nothing is animated yet.')
      return
    }
    if (!session?.renderer) {
      state.setExportError("The viewport isn't ready yet.")
      return
    }
    state.setExportBusy(true)
    state.setExportError(null)
    const fps = 30
    const canvas = session.renderer.domElement
    const renderFrame = (t: number) => {
      applyStageTime(session, stage, t)
      session.render()
    }
    const done = (blob: Blob, filename: string) => {
      triggerDownload(blob, filename)
      const s = useStore.getState()
      s.setExportBusy(false)
      s.closeVideoAsk()
      applyStageTime(session, stage, s.playT)
    }
    const fail = (err: unknown) => {
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
