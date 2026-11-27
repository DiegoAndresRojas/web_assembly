import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { buildHierarchy, defaultHierarchy, type MeshCenters } from '@/lib/hierarchy'
import { meshCenters } from '@/lib/three/hierarchyFile'
import { useStore } from '@/store'
import type { AxisDir, HierarchyExport, Project } from '@/types/project'

const AXES: AxisDir[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
const UNITS: Array<[number, string]> = [
  [0.001, 'Millimeters'],
  [0.01, 'Centimeters'],
  [0.1, 'Decimeters'],
  [1, 'Meters'],
]

const small = { fontSize: 12, height: 28, minHeight: 28 }
const grid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--space-2) var(--space-3)',
  alignItems: 'center',
} as const

/** A name that may be left to what is proposed (shown greyed). */
function NameInput({
  value,
  proposed,
  label,
  onChange,
}: {
  value: string
  proposed: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <input
      className="input"
      aria-label={label}
      style={small}
      value={value}
      placeholder={proposed}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Exports a project the way the training pipeline reads it: the
 *  assembly hierarchy (assembly.json) and the meshes of its pieces. Asks
 *  what the board alone cannot say — the world's unit, which way the
 *  product faces, the names — and keeps the answers in the project. */
export function HierarchyDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const setSettings = useStore((s) => s.setHierarchySettings)
  const exportHierarchy = useStore((s) => s.exportHierarchy)
  const renameNode = useStore((s) => s.renameProjectNode)
  const working = useStore((s) => s.working)
  const [draft, setDraft] = useState<HierarchyExport>(
    () => project.hierarchy ?? defaultHierarchy(project),
  )
  const [centers, setCenters] = useState<MeshCenters | null>(null)

  // (the library does not change by renaming: the files are read once)
  const meshes = project.meshes
  useEffect(() => {
    let live = true
    void meshCenters(meshes).then((c) => live && setCenters(c))
    return () => {
      live = false
    }
  }, [meshes])

  const hierarchy = useMemo(
    () => buildHierarchy(project, draft, centers ?? {}),
    [project, draft, centers],
  )
  const units = UNITS.some(([u]) => u === draft.unit)
    ? UNITS
    : [...UNITS, [draft.unit, `1 unit = ${draft.unit} m`] as [number, string]]
  const nameOf = (id: string) => project.board.nodes.find((n) => n.id === id)?.label ?? ''
  const setName = (map: 'assemblies' | 'children', key: string, value: string) =>
    setDraft((d) => {
      const next = { ...d[map] }
      if (value.trim()) next[key] = value
      else delete next[key]
      return { ...d, [map]: next }
    })

  const doExport = async () => {
    setSettings(project.id, draft)
    if (await exportHierarchy(project.id)) onClose()
  }

  return (
    <Dialog
      open
      wide
      title="Export for training"
      onClose={onClose}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setSettings(project.id, draft)
              onClose()
            }}
          >
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!!hierarchy.problems.length || !centers || !!working}
            onClick={() => void doExport()}
          >
            Export
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--space-3)' }}>
        A ZIP with <code>assembly.json</code> and the meshes of its pieces, ready for the training
        pipeline: each chain of assemblies is one assembly, each node of it one stage.
      </p>

      <div style={{ ...grid, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="field" style={{ marginTop: 0 }}>
          <label>The world is in</label>
          <select
            className="input"
            style={small}
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: Number(e.target.value) })}
          >
            {units.map(([u, name]) => (
              <option key={u} value={u}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {(['forward', 'up'] as const).map((key) => (
          <div key={key} className="field" style={{ marginTop: 0 }}>
            <label>{key === 'forward' ? 'The product faces' : 'Up is'}</label>
            <select
              className="input"
              style={small}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value as AxisDir })}
            >
              {AXES.filter((a) => a[1] !== draft[key === 'forward' ? 'up' : 'forward'][1]).map(
                (a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ),
              )}
            </select>
          </div>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 11, margin: 'var(--space-2) 0 0' }}>
        Which way it faces only names pieces used more than once (front / rear, left / right).
      </p>

      {hierarchy.assemblies.map((asm) => (
        <section
          key={asm.nodeId}
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-divider)',
          }}
        >
          <div style={grid}>
            <label style={{ fontWeight: 600, color: 'var(--color-neutral-200)' }}>Assembly</label>
            <NameInput
              label="Assembly name"
              value={draft.assemblies[asm.nodeId] ?? ''}
              proposed={asm.proposed}
              onChange={(v) => setName('assemblies', asm.nodeId, v)}
            />
          </div>
          <div className="text-muted" style={{ fontSize: 11, margin: 'var(--space-3) 0 4px' }}>
            Stages — renaming one renames its node on the board
          </div>
          <div style={grid}>
            {asm.sequence.map((ids, k) => {
              const nodeId = asm.stages[k]
              return (
                <StageRow
                  key={nodeId}
                  name={asm.stageNames[k]}
                  label={nameOf(nodeId)}
                  adds={ids.join(', ')}
                  onRename={(label) => renameNode(project.id, nodeId, label)}
                />
              )
            })}
          </div>
          <div className="text-muted" style={{ fontSize: 11, margin: 'var(--space-3) 0 4px' }}>
            Pieces
          </div>
          <div style={grid}>
            {asm.children.map((child) => (
              <ChildRow
                key={child.key}
                refName={child.ref}
                value={draft.children[child.key] ?? ''}
                proposed={child.proposed}
                onChange={(v) => setName('children', child.key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {hierarchy.problems.length > 0 && (
        <div
          role="alert"
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-neutral-900)',
            color: 'var(--color-neutral-200)',
            fontSize: 12,
          }}
        >
          <strong>To fix before exporting</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
            {hierarchy.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}

function StageRow({
  name,
  label,
  adds,
  onRename,
}: {
  name: string
  label: string
  adds: string
  onRename: (label: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft?.trim() && draft.trim() !== label) onRename(draft.trim())
    setDraft(null)
  }
  return (
    <>
      <input
        className="input"
        aria-label="Stage name"
        title={`Exported as ${name}`}
        style={small}
        value={draft ?? label}
        spellCheck={false}
        onFocus={() => setDraft(label)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span
        className="text-muted"
        title={adds}
        style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name === label ? '' : `${name} · `}+ {adds}
      </span>
    </>
  )
}

function ChildRow({
  refName,
  value,
  proposed,
  onChange,
}: {
  refName: string
  value: string
  proposed: string
  onChange: (value: string) => void
}) {
  return (
    <>
      <NameInput
        label={`Name of this ${refName}`}
        value={value}
        proposed={proposed}
        onChange={onChange}
      />
      <span className="text-muted" style={{ fontSize: 11 }}>
        {refName}
      </span>
    </>
  )
}
