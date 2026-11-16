import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useExport } from '@/hooks/useExport'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'

export function VideoExportDialog({ session }: { session: WorldSession | null }) {
  const videoAsk = useStore((s) => s.videoAsk)
  const videoFormat = useStore((s) => s.videoFormat)
  const setVideoFormat = useStore((s) => s.setVideoFormat)
  const exportError = useStore((s) => s.exportError)
  const exportBusy = useStore((s) => s.exportBusy)
  const closeVideoAsk = useStore((s) => s.closeVideoAsk)
  const { doVideoExport } = useExport(session)

  return (
    <Dialog
      open={videoAsk}
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
        <label>Output</label>
        <select
          className="input"
          value={videoFormat}
          onChange={(e) => setVideoFormat(e.target.value as 'webm' | 'zip')}
        >
          <option value="webm">WebM video (30 fps)</option>
          <option value="zip">PNG frames (.zip)</option>
        </select>
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
        16:9 video at 1280×720, shot through the animation camera (or your view, if the stage has no camera).
      </div>
      {exportError && (
        <div
          style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--color-accent-300)' }}
        >
          {exportError}
        </div>
      )}
    </Dialog>
  )
}
