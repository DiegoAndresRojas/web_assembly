import { useState } from 'react'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Segmented } from '@/components/Segmented'
import type { LightSource } from '@/lib/lights'
import { useStore } from '@/store'

const MODES = [
  { value: 'replace' as const, label: 'In place of mine' },
  { value: 'add' as const, label: 'Added to mine' },
]

function describe(source: LightSource): string {
  const parts = [`${source.lights} ${source.lights === 1 ? 'light' : 'lights'}`]
  if (source.environment) parts.push('environment')
  if (source.floor) parts.push('floor')
  return parts.join(', ')
}

export interface ImportLightsDialogProps {
  /** The animations earlier in the chain that have lighting, nearest first. */
  sources: LightSource[]
  hasLights: boolean
  onClose: () => void
}

/** Lights this animation the way an earlier one in its chain is lit when
 *  it ends — lighting is handed forward along the chain, never back. */
export function ImportLightsDialog({ sources, hasLights, onClose }: ImportLightsDialogProps) {
  const importLights = useStore((s) => s.importLights)
  const [stageId, setStageId] = useState(sources[0]?.stageId ?? '')
  const [mode, setMode] = useState<'replace' | 'add'>('replace')
  const source = sources.find((s) => s.stageId === stageId)

  return (
    <Dialog
      open
      title="Import lighting"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!source}
            onClick={() => {
              importLights(stageId, hasLights ? mode : 'replace')
              onClose()
            }}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="import-lights-source">From</label>
        <select
          id="import-lights-source"
          className="input"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.stageId} value={s.stageId}>
              {s.stageName} — {describe(s)}
            </option>
          ))}
        </select>
      </div>
      {hasLights && (
        <div className="field">
          <label>Its lights go</label>
          <Segmented name="import-lights-mode" value={mode} options={MODES} onChange={setMode} />
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
        Only animations earlier in this chain of assemblies are listed. The lights come as they are
        when that animation ends, as copies of your own: how they move there is not copied, and
        changing them here changes nothing there.
      </div>
    </Dialog>
  )
}
