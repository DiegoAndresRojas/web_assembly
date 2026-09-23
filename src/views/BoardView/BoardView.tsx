import type { DragEvent } from 'react'

import { BackIcon, EyeIcon, FilmIcon, PlusIcon } from '@/components/icons'
import { useStore } from '@/store'
import { BoardCanvas } from './BoardCanvas'
import { ColorDialog } from './ColorDialog'
import { DeleteMeshDialog } from './DeleteMeshDialog'
import { MeshLibrary } from './MeshLibrary'

function PaletteToken({
  icon,
  label,
  active,
  dataKind,
  onDragStart,
  onEnter,
  onLeave,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  dataKind: 'assembly' | 'observer' | 'animation'
  onDragStart: (e: DragEvent) => void
  onEnter: () => void
  onLeave: () => void
}) {
  const color = dataKind === 'assembly' ? 'var(--color-accent)' : 'var(--color-neutral-400)'
  return (
    <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
      <div
        draggable
        onDragStart={onDragStart}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        title={label}
        style={{
          cursor: 'grab',
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${color}`,
          color,
        }}
      >
        {icon}
      </div>
      {active && (
        <span
          className="text-muted"
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

export function BoardView() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.pid))
  const backToProjects = useStore((s) => s.backToProjects)
  const renameProject = useStore((s) => s.renameProject)
  const hoverAssembly = useStore((s) => s.hoverAssembly)
  const hoverObserver = useStore((s) => s.hoverObserver)
  const hoverAnimation = useStore((s) => s.hoverAnimation)
  const setPaletteHover = useStore((s) => s.setPaletteHover)

  if (!project) return null

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <aside
        style={{
          width: 286,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'auto',
        }}
      >
        <button
          className="btn btn-ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={backToProjects}
        >
          <BackIcon size={15} /> All projects
        </button>
        <input
          className="input"
          value={project.name}
          onChange={(e) => renameProject(project.id, e.target.value)}
          style={{
            background: 'transparent',
            border: 0,
            borderBottom: '1px solid transparent',
            borderRadius: 0,
            padding: '2px 0',
            minHeight: 24,
            fontSize: 14,
          }}
        />

        <MeshLibrary project={project} />

        <div
          style={{
            flex: 'none',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            boxShadow: 'inset 0 1px 0 var(--color-divider)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <PaletteToken
              icon={<PlusIcon size={20} />}
              label="Assembly"
              active={hoverAssembly}
              dataKind="assembly"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'assembly')}
              onEnter={() => setPaletteHover('assembly')}
              onLeave={() => setPaletteHover(null)}
            />
            <PaletteToken
              icon={<EyeIcon size={20} />}
              label="Observer"
              active={hoverObserver}
              dataKind="observer"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'observer')}
              onEnter={() => setPaletteHover('observer')}
              onLeave={() => setPaletteHover(null)}
            />
            <PaletteToken
              icon={<FilmIcon size={19} />}
              label="Animation"
              active={hoverAnimation}
              dataKind="animation"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'animation')}
              onEnter={() => setPaletteHover('animation')}
              onLeave={() => setPaletteHover(null)}
            />
          </div>
        </div>
      </aside>

      <BoardCanvas project={project} />

      <ColorDialog project={project} />
      <DeleteMeshDialog />
    </div>
  )
}
