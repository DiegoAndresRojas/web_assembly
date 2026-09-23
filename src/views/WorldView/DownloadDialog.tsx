import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useExport } from '@/hooks/useExport'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import type { DownloadFormat } from '@/lib/three/buildMesh'

export function DownloadDialog({ session }: { session: WorldSession | null }) {
  const dlAsk = useStore((s) => s.dlAsk)
  const dlFormat = useStore((s) => s.dlFormat)
  const setDlFormat = useStore((s) => s.setDlFormat)
  const closeDownload = useStore((s) => s.closeDownload)
  const { doDownload } = useExport(session)

  return (
    <Dialog
      open={dlAsk}
      title="Download mesh"
      actions={
        <>
          <Button variant="secondary" onClick={closeDownload}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doDownload}>
            Download
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Format</label>
        <select
          className="input"
          value={dlFormat}
          onChange={(e) => setDlFormat(e.target.value as DownloadFormat)}
        >
          <option value="glb">GLB</option>
          <option value="obj">OBJ</option>
          <option value="stl">STL</option>
        </select>
      </div>
    </Dialog>
  )
}
