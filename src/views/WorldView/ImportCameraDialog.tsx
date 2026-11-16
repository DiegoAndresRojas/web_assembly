import { useState } from 'react'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Segmented } from '@/components/Segmented'
import type { CameraSource } from '@/lib/cameras'
import { useStore } from '@/store'

const MOMENTS = [
  { value: 'end' as const, label: 'Where it ends' },
  { value: 'start' as const, label: 'Where it starts' },
]

export interface ImportCameraDialogProps {
  sources: CameraSource[]
  /** Whether the open animation already has a camera (it is then moved,
   *  not created). */
  hasCamera: boolean
  onClose: () => void
}

/** Starts this animation's camera from the position and rotation another
 *  animation's camera has — by default where that one ends, so the shot
 *  carries on from the step before. */
export function ImportCameraDialog({ sources, hasCamera, onClose }: ImportCameraDialogProps) {
  const importCamera = useStore((s) => s.importCamera)
  const [stageId, setStageId] = useState(sources[0]?.stageId ?? '')
  const [moment, setMoment] = useState<'start' | 'end'>('end')
  const source = sources.find((s) => s.stageId === stageId)

  return (
    <Dialog
      open
      title="Import a camera"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!source}
            onClick={() => {
              importCamera(stageId, moment)
              onClose()
            }}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="import-camera-source">Camera</label>
        <select
          id="import-camera-source"
          className="input"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.stageId} value={s.stageId}>
              {s.name} — from {s.stageName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Take its position and rotation</label>
        <Segmented
          name="import-camera-moment"
          value={moment}
          options={MOMENTS}
          onChange={setMoment}
        />
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
        {hasCamera
          ? 'This animation already has a camera: it keeps its name and its actions, and starts from the imported pose.'
          : 'Creates this animation’s camera at that pose, with the same name. Its movement is not copied.'}
      </div>
    </Dialog>
  )
}
