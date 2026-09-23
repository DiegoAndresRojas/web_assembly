import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { nodeById, meshFor } from '@/lib/graph'
import { COLOR_PRESETS, useStore } from '@/store'
import type { Project } from '@/types/project'

export interface ColorDialogProps {
  project: Project
}

export function ColorDialog({ project }: ColorDialogProps) {
  const colorEdit = useStore((s) => s.colorEdit)
  const setColorDraft = useStore((s) => s.setColorDraft)
  const cancelColorEditor = useStore((s) => s.cancelColorEditor)
  const applyColorEditor = useStore((s) => s.applyColorEditor)

  const open = !!colorEdit
  const node = colorEdit ? nodeById(project, colorEdit.nodeId) : null
  const mesh = node ? meshFor(project, node) : null

  return (
    <Dialog
      open={open}
      title={`Color · ${mesh?.name ?? ''}`}
      actions={
        <>
          <Button variant="secondary" onClick={cancelColorEditor}>
            Cancel
          </Button>
          <Button variant="primary" onClick={applyColorEditor}>
            Apply
          </Button>
        </>
      }
    >
      {colorEdit && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              type="color"
              value={colorEdit.value}
              onChange={(e) => setColorDraft(e.target.value)}
              style={{
                width: 44,
                height: 34,
                padding: 0,
                border: '1px solid var(--color-neutral-700)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <input
              className="input"
              type="text"
              value={colorEdit.value}
              onChange={(e) => setColorDraft(e.target.value)}
              style={{ width: 110, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-3)',
            }}
          >
            {COLOR_PRESETS.map((c) => (
              <div
                key={c}
                onClick={() => setColorDraft(c)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  border: '1px solid var(--color-divider)',
                  background: c,
                }}
              />
            ))}
          </div>
        </>
      )}
    </Dialog>
  )
}
