import { Button } from '@/components/Button'
import { Segmented } from '@/components/Segmented'
import { TrashIcon } from '@/components/icons'
import { inputLabel } from '@/lib/graph'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'

const KP_MODES = [
  { value: 'faces' as const, label: 'Faces' },
  { value: 'edges' as const, label: 'Edges' },
]

export interface KeypointEditorProps {
  project: Project
  stage: Stage
}

export function KeypointEditor({ project, stage }: KeypointEditorProps) {
  const kpOn = useStore((s) => s.kpOn)
  const kpMode = useStore((s) => s.kpMode)
  const kpEditing = useStore((s) => s.kpEditing)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const toggleKp = useStore((s) => s.toggleKp)
  const setKpMode = useStore((s) => s.setKpMode)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const openKpEdit = useStore((s) => s.openKpEdit)
  const closeKpEdit = useStore((s) => s.closeKpEdit)
  const cancelKpEdit = useStore((s) => s.cancelKpEdit)
  const removeLink = useStore((s) => s.removeLink)
  const setKpRotAxis = useStore((s) => s.setKpRotAxis)
  const doUnion = useStore((s) => s.doUnion)
  const undoUnion = useStore((s) => s.undoUnion)
  const openDownload = useStore((s) => s.openDownload)

  const editingLink = kpEditing ? stage.links.find((l) => l.id === kpEditing) : null
  const editingMemberB = editingLink
    ? stage.members.find((m) => m.nodeId === editingLink.nodeB)
    : null

  return (
    <>
      <h6 style={{ flex: 'none', margin: 0, fontSize: 11, color: 'var(--color-neutral-400)' }}>
        Keypoints
      </h6>
      <Button
        variant="secondary"
        className={kpOn ? 'btn--on' : ''}
        aria-pressed={kpOn}
        title={kpOn ? 'Stop picking keypoints' : 'Click points on the meshes to link them'}
        onClick={() => toggleKp(!kpOn)}
        style={{ flex: 'none', fontSize: 12, justifyContent: 'flex-start', gap: 8 }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: kpOn ? '#fff' : 'var(--color-neutral-500)',
            boxShadow: kpOn ? '0 0 0 3px rgba(255, 255, 255, 0.25)' : undefined,
          }}
        />
        {kpOn ? 'Picking keypoints' : 'Select keypoints'}
      </Button>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Segmented name="kpmode" value={kpMode} options={KP_MODES} onChange={setKpMode} />
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
        }}
      >
        <Button
          variant="secondary"
          style={{ flex: 1, fontSize: 11 }}
          disabled={!canUndo}
          onClick={undo}
        >
          Undo
        </Button>
        <Button
          variant="secondary"
          style={{ flex: 1, fontSize: 11 }}
          disabled={!canRedo}
          onClick={redo}
        >
          Redo
        </Button>
      </div>

      <div
        style={{
          marginTop: 'var(--space-3)',
          flex: 1,
          minHeight: 124,
          overflow: 'auto',
          padding: 'var(--space-2)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-neutral-900)',
        }}
      >
        {editingLink && editingMemberB ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'ui-monospace, monospace',
                  color: 'var(--color-accent-300)',
                }}
              >
                Rotate to align
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}
                  onClick={cancelKpEdit}
                >
                  Cancel
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={closeKpEdit}>
                  Done
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <label
                  key={axis}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    fontFamily: 'ui-monospace, monospace',
                    color: { x: '#e06a6a', y: '#7ac08f', z: '#6a8fe0' }[axis],
                  }}
                >
                  {axis.toUpperCase()}
                  <input
                    className="input"
                    type="number"
                    step={5}
                    value={editingMemberB.pose.rot[axis]}
                    onChange={(e) => setKpRotAxis(axis, Number(e.target.value))}
                    style={{
                      minHeight: 26,
                      padding: '2px 6px',
                      fontSize: 11,
                      color: 'var(--color-text)',
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    fontWeight: 400,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 10,
                    color: 'var(--color-accent-300)',
                    paddingBottom: 3,
                  }}
                >
                  A
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    fontWeight: 400,
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 10,
                    color: 'var(--color-accent-300)',
                    paddingBottom: 3,
                  }}
                >
                  B
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    fontWeight: 400,
                    fontSize: 10,
                    color: 'var(--color-neutral-500)',
                    paddingBottom: 3,
                  }}
                >
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {stage.links.map((l) => {
                const nameA = inputLabel(project, l.nodeA)
                const nameB = inputLabel(project, l.nodeB)
                const color =
                  l.state === 'solved'
                    ? '#7ac08f'
                    : l.state === 'gap'
                      ? '#e06a6a'
                      : 'var(--color-neutral-400)'
                return (
                  <tr key={l.id}>
                    <td
                      style={{ cursor: 'pointer', padding: '2px 0' }}
                      onClick={() => openKpEdit(l.id)}
                    >
                      {nameA}
                    </td>
                    <td
                      style={{ cursor: 'pointer', padding: '2px 0' }}
                      onClick={() => openKpEdit(l.id)}
                    >
                      {nameB}
                    </td>
                    <td style={{ padding: '2px 0' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <span style={{ fontSize: 10, color }}>
                          {l.state === 'solved' ? 'Solved' : l.state === 'gap' ? 'Gap' : 'Pending'}
                        </span>
                        <div
                          title="Delete constraint"
                          onClick={() => removeLink(l.id)}
                          style={{
                            width: 16,
                            height: 16,
                            display: 'grid',
                            placeItems: 'center',
                            color: 'var(--color-neutral-400)',
                            cursor: 'pointer',
                          }}
                        >
                          <TrashIcon size={12} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-4)',
        }}
      >
        {/* one toggle: pressed while the pieces are united */}
        <Button
          variant="secondary"
          className={stage.union ? 'btn--on' : ''}
          aria-pressed={!!stage.union}
          style={{ flex: 2, fontSize: 11 }}
          disabled={!stage.union && stage.links.length === 0}
          title={stage.union ? 'United — click to cancel the union' : 'Unite the linked pieces'}
          onClick={stage.union ? undoUnion : doUnion}
        >
          {stage.union ? '✓ United' : 'Union'}
        </Button>
        <Button
          variant="secondary"
          style={{ flex: 1, fontSize: 11 }}
          disabled={!stage.union}
          onClick={openDownload}
        >
          Download
        </Button>
      </div>
    </>
  )
}
