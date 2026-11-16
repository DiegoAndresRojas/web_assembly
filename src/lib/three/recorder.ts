// Canvas capture for animation export: a WebM video via MediaRecorder, or a
// sequence of PNG frame blobs (zipped up by hooks/useExport.ts). Typed
// port of only_js/src/composables/useRecorder.js.

function pickWebmMime(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return 'video/webm'
}

export interface RecordOptions {
  canvas: HTMLCanvasElement
  fps: number
  duration: number
  renderFrame: (t: number) => void
}

/** Drives `renderFrame(t)` at `fps` for `duration` seconds while recording
 *  `canvas` to a WebM Blob. `renderFrame` should synchronously set the
 *  scene to time `t` and render before returning. */
export function recordWebm({ canvas, fps, duration, renderFrame }: RecordOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('MediaRecorder is not available in this browser'))
      return
    }
    const mimeType = pickWebmMime()
    let stream: MediaStream
    try {
      stream = canvas.captureStream(fps)
    } catch (e) {
      reject(e)
      return
    }
    const rec = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onerror = (e) =>
      reject(new Error((e as unknown as { error?: Error }).error?.message ?? 'recording failed'))
    rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }))

    const totalFrames = Math.max(1, Math.round(duration * fps))
    const stepMs = 1000 / fps
    let i = 0
    rec.start()
    const step = () => {
      renderFrame(i / fps)
      i++
      if (i <= totalFrames) setTimeout(step, stepMs)
      else setTimeout(() => rec.stop(), stepMs)
    }
    step()
  })
}

export interface CaptureFramesOptions extends RecordOptions {
  onProgress?: (fraction: number) => void
}

export interface CapturedFrame {
  index: number
  t: number
  blob: Blob
}

/** Same driving loop, but returns one PNG Blob per frame instead of a
 *  video (used for the "PNG frames (.zip)" export option). */
export async function captureFrames({
  canvas,
  fps,
  duration,
  renderFrame,
  onProgress,
}: CaptureFramesOptions): Promise<CapturedFrame[]> {
  const totalFrames = Math.max(1, Math.round(duration * fps)) + 1
  const frames: CapturedFrame[] = []
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps
    renderFrame(t)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
    frames.push({ index: i, t, blob })
    onProgress?.((i + 1) / totalFrames)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  return frames
}
