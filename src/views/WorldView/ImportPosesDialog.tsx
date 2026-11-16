import { useState } from 'react'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Segmented } from '@/components/Segmented'
import { stageName } from '@/lib/cameras'
import { poseSources } from '@/lib/chain'
import { inputLabel, nodeById } from '@/lib/graph'
import { useStore } from '@/store'
import type { Project } from '@/types/project'

const MOMENTS = [
  { value: 'end' as const, label: 'Where it ends' },
  { value: 'start' as const, label: 'Where it starts' },
]

/** "As assembled" in the source list: drop the imported start poses. */
const ASSEMBLED = ''

export interface ImportPosesDialogProps {
  project: Project
  stageId: string
  /** The piece selected in the world, if any — the import can be kept to it. */
  selectedKey: string | null
  onClose: () => void
}

/** Starts this animation's pieces where another animation has them — by
 *  default where that one ends, so the step carries on from the one
 *  before — or puts them back where their assembly has them. */
export function ImportPosesDialog({
  project,
  stageId,
  selectedKey,
  onClose,
}: ImportPosesDialogProps) {
  const importStartPoses = useStore((s) => s.importStartPoses)
  const sources = poseSources(project, stageId)
  const [from, setFrom] = useState(sources[0]?.stageId ?? ASSEMBLED)
  const [moment, setMoment] = useState<'start' | 'end'>('end')
  const [onlySelected, setOnlySelected] = useState(false)
  const only = onlySelected ? selectedKey : null

  return (
    <Dialog
      open
      title="Import positions"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              importStartPoses(from === ASSEMBLED ? null : from, moment, only)
              onClose()
            }}
          >
            {from === ASSEMBLED ? 'Reset' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="import-poses-source">Start the pieces as they are in</label>
        <select
          id="import-poses-source"
          className="input"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.stageId} value={s.stageId}>
              {stageName(nodeById(project, s.stageId))} — {s.pieces}{' '}
              {s.pieces === 1 ? 'piece' : 'pieces'} in common
            </option>
          ))}
          <option value={ASSEMBLED}>The assembly — as assembled</option>
        </select>
        {sources.length === 0 && (
          <div className="text-muted" style={{ fontSize: 11 }}>
            No other animation shares pieces with this one yet.
          </div>
        )}
      </div>

      {from !== ASSEMBLED && (
        <div className="field">
          <label>Take their positions</label>
          <Segmented
            name="import-poses-moment"
            value={moment}
            options={MOMENTS}
            onChange={setMoment}
          />
        </div>
      )}

      {selectedKey && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 'var(--space-3)',
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
          />
          Only {inputLabel(project, selectedKey)} and what is inside it
        </label>
      )}

      <div className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
        {from === ASSEMBLED
          ? 'The pieces go back to where their assembly put them.'
          : 'Only where the pieces start changes. Their tracks start there too; the actions on them stay as they are.'}
      </div>
    </Dialog>
  )
}
