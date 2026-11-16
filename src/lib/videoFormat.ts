// The shape and backdrop of an exported video. Pure — the three.js side
// lives in lib/three/worldSession.ts.
import type { FrameFormat } from '@/types/project'

export const FRAME_FORMATS: Array<{ id: FrameFormat; label: string }> = [
  { id: '16:9', label: '16:9 — landscape' },
  { id: '9:16', label: '9:16 — portrait' },
  { id: '1:1', label: '1:1 — square' },
  { id: '4:3', label: '4:3 — classic' },
]

export const DEFAULT_FRAME_FORMAT: FrameFormat = '16:9'

export function isFrameFormat(v: unknown): v is FrameFormat {
  return FRAME_FORMATS.some((f) => f.id === v)
}

/** Width ÷ height of a frame format. */
export function aspectOf(format: FrameFormat): number {
  const [w, h] = format.split(':').map(Number)
  return w / h
}

/** What an export draws behind the pieces: one flat color, nothing at all
 *  (alpha), or the workspace as it looks while editing (dark, with grid). */
export type VideoBackground = 'color' | 'transparent' | 'workspace'

export const DEFAULT_VIDEO_COLOR = '#ffffff'

/** Longest side of an exported video, in pixels. */
export const EXPORT_LONG_SIDE = 1280

/** Pixel size of a video of the given aspect: the long side is
 *  `longSide`, both sides even (video encoders require it). */
export function exportSize(
  aspect: number,
  longSide = EXPORT_LONG_SIDE,
): { width: number; height: number } {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  return safe >= 1
    ? { width: even(longSide), height: even(longSide / safe) }
    : { width: even(longSide * safe), height: even(longSide) }
}
