import { useStore } from '@/store'
import type { PoseDraft } from '@/store/types'
import type { WorldSession } from '@/lib/three/worldSession'
import type { Axis } from '@/types/project'

const AXIS_COLOR: Record<Axis, string> = { x: '#e06a6a', y: '#7ac08f', z: '#6a8fe0' }

function PoseAxisFields({
  pose,
  side,
  kind,
  disabled,
}: {
  pose: PoseDraft
  side: 'from' | 'to'
  kind: 'pos' | 'rot'
  disabled: boolean
}) {
  const setDraftAxis = useStore((s) => s.setDraftAxis)
  const step = kind === 'pos' ? 0.1 : 1
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label
          key={axis}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontFamily: 'ui-monospace, monospace',
            color: AXIS_COLOR[axis],
          }}
        >
          <span style={{ width: 16, textAlign: 'right' }}>{axis.toUpperCase()}</span>
          <input
            className="input"
            type="number"
            step={step}
            value={pose[kind][axis]}
            disabled={disabled}
            onChange={(e) => setDraftAxis(side, kind, axis, Number(e.target.value))}
            style={{
              width: 70,
              minHeight: 26,
              padding: '2px 6px',
              fontSize: 11,
              color: 'var(--color-text)',
            }}
          />
        </label>
      ))}
    </div>
  )
}

export function ActionConfigEditor({ session }: { session: WorldSession | null }) {
  const cfgTarget = useStore((s) => s.cfgTarget)
  const cfgDraft = useStore((s) => s.cfgDraft)
  const projects = useStore((s) => s.projects)
  const pid = useStore((s) => s.pid)
  const aid = useStore((s) => s.aid)
  const tlCancelConfig = useStore((s) => s.tlCancelConfig)
  const tlSaveConfig = useStore((s) => s.tlSaveConfig)
  const onCfgDelete = useStore((s) => s.onCfgDelete)
  const setDraftStart = useStore((s) => s.setDraftStart)
  const setDraftDuration = useStore((s) => s.setDraftDuration)
  const setEditingSide = useStore((s) => s.setEditingSide)
  const setDraftPoseFromCamera = useStore((s) => s.setDraftPoseFromCamera)
  const setDraftToLinked = useStore((s) => s.setDraftToLinked)

  if (!cfgTarget || !cfgDraft) return null

  const project = projects.find((p) => p.id === pid)
  const stage = project && aid ? project.stages[aid] : undefined
  const track = stage?.tracks.find((t) => t.id === cfgTarget.trackId)
  const isCam = track?.targetKind === 'camera'
  const editingFrom = cfgDraft.editingSide === 'from'
  const editingTo = cfgDraft.editingSide === 'to'
  const anyEditing = !!cfgDraft.editingSide

  const cfgDeleteLabel = cfgTarget.isInit ? 'Close' : cfgTarget.isNew ? 'Discard' : 'Delete action'

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 'var(--space-2) var(--space-3) var(--space-3)',
        display: 'flex',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={onCfgDelete}>
            {cfgDeleteLabel}
          </button>
          <div style={{ flex: 1 }} />
          {!cfgTarget.isInit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: 'var(--color-neutral-400)',
                }}
              >
                Start s
                <input
                  className="input"
                  type="number"
                  step={0.1}
                  value={cfgDraft.start}
                  onChange={(e) => setDraftStart(Number(e.target.value))}
                  style={{ width: 66, minHeight: 26, padding: '2px 6px', fontSize: 11 }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: 'var(--color-neutral-400)',
                }}
              >
                Length s
                <input
                  className="input"
                  type="number"
                  step={0.1}
                  value={cfgDraft.duration}
                  onChange={(e) => setDraftDuration(Number(e.target.value))}
                  style={{ width: 66, minHeight: 26, padding: '2px 6px', fontSize: 11 }}
                />
              </label>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={tlCancelConfig}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={tlSaveConfig}>
              Save
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {cfgTarget.isInit ? 'Pose' : 'Start'}
              </span>
              <span style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                {isCam ? 'Camera' : 'Mesh'}
              </span>
            </div>
            <PoseAxisFields
              pose={cfgDraft.fromPose}
              side="from"
              kind="pos"
              disabled={!editingFrom}
            />
            <PoseAxisFields
              pose={cfgDraft.fromPose}
              side="from"
              kind="rot"
              disabled={!editingFrom}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11 }}
                disabled={anyEditing}
                onClick={() => setEditingSide('from')}
              >
                Edit
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 11 }}
                disabled={!editingFrom}
                onClick={() => setEditingSide(null)}
              >
                Save
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11 }}
                disabled={!editingFrom}
                onClick={() => setEditingSide(null)}
              >
                Cancel
              </button>
              {isCam && editingFrom && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11 }}
                  title="Take the vantage point you are looking from"
                  onClick={() => session && setDraftPoseFromCamera('from', session.getCameraPose())}
                >
                  Dev camera
                </button>
              )}
            </div>
          </div>

          {!cfgTarget.isInit && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>End</span>
                <span style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                  {isCam ? 'Camera' : 'Mesh'}
                </span>
                {!isCam && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 10,
                      color: 'var(--color-neutral-400)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cfgDraft.toLinked}
                      onChange={(e) => setDraftToLinked(e.target.checked)}
                    />
                    <span>To connector</span>
                  </label>
                )}
              </div>
              <PoseAxisFields pose={cfgDraft.toPose} side="to" kind="pos" disabled={!editingTo} />
              <PoseAxisFields pose={cfgDraft.toPose} side="to" kind="rot" disabled={!editingTo} />
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11 }}
                  disabled={anyEditing}
                  onClick={() => setEditingSide('to')}
                >
                  Edit
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 11 }}
                  disabled={!editingTo}
                  onClick={() => setEditingSide(null)}
                >
                  Save
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11 }}
                  disabled={!editingTo}
                  onClick={() => setEditingSide(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
