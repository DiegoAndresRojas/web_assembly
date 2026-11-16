import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useExport, videoAspect } from '@/hooks/useExport'
import type { WorldSession } from '@/lib/three/worldSession'
import { exportSize, FRAME_FORMATS, type VideoBackground } from '@/lib/videoFormat'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { FrameFormat } from '@/types/project'

const BACKGROUNDS: Array<{ id: VideoBackground; label: string }> = [
  { id: 'color', label: 'Solid color' },
  { id: 'transparent', label: 'Transparent — pieces only' },
  { id: 'workspace', label: 'Workspace — dark, with grid' },
]

export function VideoExportDialog({ session }: { session: WorldSession | null }) {
  const videoAsk = useStore((s) => s.videoAsk)
  const videoFormat = useStore((s) => s.videoFormat)
  const setVideoFormat = useStore((s) => s.setVideoFormat)
  const videoBackground = useStore((s) => s.videoBackground)
  const setVideoBackground = useStore((s) => s.setVideoBackground)
  const videoColor = useStore((s) => s.videoColor)
  const setVideoColor = useStore((s) => s.setVideoColor)
  const setStageFrame = useStore((s) => s.setStageFrame)
  const exportError = useStore((s) => s.exportError)
  const exportBusy = useStore((s) => s.exportBusy)
  const closeVideoAsk = useStore((s) => s.closeVideoAsk)
  const stage = useStore((s) => selectCurrentProject(s)?.stages[s.aid ?? ''] ?? null)
  const { doVideoExport } = useExport(session)

  if (!videoAsk || !stage) return null
  const hasCamera = stage.tracks.some((t) => t.targetKind === 'camera')
  const size = session ? exportSize(videoAspect(session, stage)) : null

  return (
    <Dialog
      open
      title="Export the animation"
      actions={
        <>
          <Button variant="secondary" disabled={exportBusy} onClick={closeVideoAsk}>
            Cancel
          </Button>
          <Button variant="primary" disabled={exportBusy} onClick={doVideoExport}>
            {exportBusy ? 'Exporting…' : 'Export'}
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="video-output">Output</label>
        <select
          id="video-output"
          className="input"
          value={videoFormat}
          disabled={exportBusy}
          onChange={(e) => setVideoFormat(e.target.value as 'webm' | 'zip')}
        >
          <option value="webm">WebM video (30 fps)</option>
          <option value="zip">PNG frames (.zip)</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="video-frame">Camera format</label>
        {hasCamera ? (
          <select
            id="video-frame"
            className="input"
            value={stage.frame}
            disabled={exportBusy}
            onChange={(e) => setStageFrame(e.target.value as FrameFormat)}
          >
            {FRAME_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ fontSize: 12 }}>Same shape as your view</div>
        )}
        <div className="text-muted" style={{ fontSize: 11 }}>
          {hasCamera
            ? 'Shot through the animation camera. Its preview takes this format too.'
            : 'This stage has no animation camera, so the video is shot from your view.'}
          {size && ` ${size.width}×${size.height} px.`}
        </div>
      </div>

      <div className="field">
        <label htmlFor="video-background">Background</label>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <select
            id="video-background"
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            value={videoBackground}
            disabled={exportBusy}
            onChange={(e) => setVideoBackground(e.target.value as VideoBackground)}
          >
            {BACKGROUNDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          {videoBackground === 'color' && (
            <input
              type="color"
              aria-label="Background color"
              title="Background color"
              className="input"
              style={{ width: 44, flex: 'none', padding: 2 }}
              value={videoColor}
              disabled={exportBusy}
              onChange={(e) => setVideoColor(e.target.value)}
            />
          )}
        </div>
        {videoBackground === 'transparent' && videoFormat === 'webm' && (
          <div className="text-muted" style={{ fontSize: 11 }}>
            Not every browser or player keeps transparency in WebM. PNG frames always do.
          </div>
        )}
      </div>

      {exportError && (
        <div
          role="alert"
          style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--color-accent-300)' }}
        >
          {exportError}
        </div>
      )}
    </Dialog>
  )
}
