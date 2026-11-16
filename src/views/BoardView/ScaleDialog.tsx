import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { degree, meshFor, nodeById } from '@/lib/graph'
import { factorOptions, formatSize, recommendedFactor, scaledSize } from '@/lib/meshScale'
import { useStore } from '@/store'
import type { Project } from '@/types/project'

function Option({
  checked,
  label,
  detail,
  badge,
  onSelect,
}: {
  checked: boolean
  label: string
  detail: string
  badge?: string
  onSelect: () => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: checked ? 'var(--color-accent-800)' : 'transparent',
      }}
    >
      <input type="radio" name="ms-scale" checked={checked} onChange={onSelect} />
      <span style={{ width: 64, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
        {label}
      </span>
      <span
        className="text-muted"
        style={{ flex: 1, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
      >
        {detail}
      </span>
      {badge && <span style={{ fontSize: 10, color: 'var(--color-accent-300)' }}>{badge}</span>}
    </label>
  )
}

/** Scale a board piece by a power of ten — opened automatically when a
 *  dropped mesh is very small, or from the node's "Scale" button. */
export function ScaleDialog({ project }: { project: Project }) {
  const scaleEdit = useStore((s) => s.scaleEdit)
  const setScaleDraft = useStore((s) => s.setScaleDraft)
  const cancelScaleEditor = useStore((s) => s.cancelScaleEditor)
  const applyScaleEditor = useStore((s) => s.applyScaleEditor)

  const node = scaleEdit ? nodeById(project, scaleEdit.nodeId) : null
  const mesh = node ? meshFor(project, node) : null
  if (!scaleEdit) return null

  const { size, factor, prompted } = scaleEdit
  const rec = recommendedFactor(size)
  const options = [1, ...factorOptions(size)]
  const custom = !options.includes(factor)
  const wired = node ? degree(project, node.id) > 0 : false

  return (
    <Dialog
      open
      title={`Scale · ${mesh?.name ?? ''}`}
      actions={
        <>
          <Button variant="secondary" onClick={cancelScaleEditor}>
            {prompted ? 'Keep as is' : 'Cancel'}
          </Button>
          <Button variant="primary" onClick={applyScaleEditor}>
            Apply ×{factor}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        {prompted && (
          <div style={{ marginBottom: 6 }}>
            This piece is very small — scale it up to whole units?
          </div>
        )}
        <span className="text-muted">Size in the file: </span>
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{formatSize(size)}</span>
      </div>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'var(--space-3)' }}
      >
        {options.map((f) => (
          <Option
            key={f}
            checked={factor === f}
            label={f === 1 ? 'As is' : `×${f}`}
            detail={formatSize(scaledSize(size, f))}
            badge={f === rec && f !== 1 ? 'recommended' : undefined}
            onSelect={() => setScaleDraft(f)}
          />
        ))}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: custom ? 'var(--color-accent-800)' : 'transparent',
          }}
        >
          <span style={{ width: 84, fontSize: 12 }}>Custom ×</span>
          <input
            className="input"
            type="number"
            min={0}
            step="any"
            value={factor}
            onChange={(e) => setScaleDraft(Number(e.target.value))}
            style={{ width: 110, height: 28, minHeight: 28, fontSize: 12 }}
          />
          <span
            className="text-muted"
            style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
          >
            {formatSize(scaledSize(size, factor))}
          </span>
        </label>
      </div>
      {wired && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
          This piece is already wired into a stage: keypoint links made with it keep their old
          positions and may need to be redone.
        </div>
      )}
    </Dialog>
  )
}
