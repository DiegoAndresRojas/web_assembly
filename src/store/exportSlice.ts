// Dialog-only state for the download and video-export dialogs. Running
// the actual export needs a live three.js session/canvas, so that logic
// lives in hooks/useExport.ts (called from the views), not here.
import { DEFAULT_VIDEO_COLOR } from '@/lib/videoFormat'
import type { ExportActions, ExportState, Set } from './types'

export const initialExportState: ExportState = {
  dlAsk: false,
  dlFormat: 'glb',
  videoAsk: false,
  videoFormat: 'webm',
  videoBackground: 'color',
  videoColor: DEFAULT_VIDEO_COLOR,
  exportBusy: false,
  exportError: null,
}

export function createExportSlice(set: Set): ExportActions {
  return {
    openDownload() {
      set((state) => {
        state.dlAsk = true
      })
    },
    closeDownload() {
      set((state) => {
        state.dlAsk = false
      })
    },
    setDlFormat(f) {
      set((state) => {
        state.dlFormat = f
      })
    },
    openVideoAsk() {
      set((state) => {
        state.videoAsk = true
        state.exportError = null
      })
    },
    closeVideoAsk() {
      set((state) => {
        if (state.exportBusy) return
        state.videoAsk = false
      })
    },
    setVideoFormat(f) {
      set((state) => {
        state.videoFormat = f
      })
    },
    setVideoBackground(background) {
      set((state) => {
        state.videoBackground = background
      })
    },
    setVideoColor(color) {
      set((state) => {
        state.videoColor = color
      })
    },
    setExportBusy(busy) {
      set((state) => {
        state.exportBusy = busy
      })
    },
    setExportError(err) {
      set((state) => {
        state.exportError = err
      })
    },
  }
}
