import { useEffect, type DragEvent } from 'react'

import { BackIcon, FilmIcon, FrameIcon, PlusIcon } from '@/components/icons'
import { useStore } from '@/store'
import type { PaletteKind } from '@/store/types'
import { BoardCanvas } from './BoardCanvas'
import { ColorDialog } from './ColorDialog'
import { DeleteMeshDialog } from './DeleteMeshDialog'
import { MeshLibrary } from './MeshLibrary'
import { ScaleDialog } from './ScaleDialog'

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
  dataKind: PaletteKind
  onDragStart: (e: DragEvent) => void
  onEnter: () => void
  onLeave: () => void
}) {
  const color = dataKind === 'animation' ? 'var(--color-neutral-400)' : 'var(--color-accent)'
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
          borderRadius: dataKind === 'frame' ? 'var(--radius-md)' : '50%',
          display: 'grid',
          placeItems: 'center',
          border: `1px ${dataKind === 'frame' ? 'dashed' : 'solid'} ${color}`,
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
  const paletteHover = useStore((s) => s.paletteHover)
  const setPaletteHover = useStore((s) => s.setPaletteHover)
  const boardUndo = useStore((s) => s.boardUndo)
  const boardRedo = useStore((s) => s.boardRedo)

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) on the board — a text field keeps
  // its own undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
      if (typing) return
      const state = useStore.getState()
      // (a dialog that is open has the keyboard)
      if (state.confirm || state.colorEdit || state.scaleEdit) return
      if (document.querySelector('.dialog')) return
      if (!(e.ctrlKey || e.metaKey)) {
        // Delete removes what is selected; Escape lets go of it
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (state.selEdge) state.deleteSelectedEdge()
          else if (state.selIds.length > 1) state.deleteNodes(state.selIds)
          else if (state.selId) state.deleteNode(state.selId)
          else if (state.selFrame) state.deleteFrame(state.selFrame)
          else return
          e.preventDefault()
        } else if (e.key === 'Escape') {
          state.cancelLinking()
          state.selectNode(null)
          if (state.tool === 'frame') state.setTool('select')
        }
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'a') {
        // Ctrl+A: every node on the board
        e.preventDefault()
        const open = state.projects.find((p) => p.id === state.pid)
        state.selectNodes(open?.board.nodes.map((n) => n.id) ?? [])
        return
      }
      if (key !== 'z' && key !== 'y') return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) boardRedo()
      else boardUndo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boardUndo, boardRedo])

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
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={backToProjects}>
            <BackIcon size={15} /> All projects
          </button>
        </div>
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
              active={paletteHover === 'assembly'}
              dataKind="assembly"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'assembly')}
              onEnter={() => setPaletteHover('assembly')}
              onLeave={() => setPaletteHover(null)}
            />
            <PaletteToken
              icon={<FilmIcon size={19} />}
              label="Animation"
              active={paletteHover === 'animation'}
              dataKind="animation"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'animation')}
              onEnter={() => setPaletteHover('animation')}
              onLeave={() => setPaletteHover(null)}
            />
            <PaletteToken
              icon={<FrameIcon size={20} />}
              label="Presentation"
              active={paletteHover === 'frame'}
              dataKind="frame"
              onDragStart={(e) => e.dataTransfer.setData('text/ms-node-kind', 'frame')}
              onEnter={() => setPaletteHover('frame')}
              onLeave={() => setPaletteHover(null)}
            />
          </div>
        </div>
      </aside>

      <BoardCanvas project={project} />

      <ColorDialog project={project} />
      <ScaleDialog project={project} />
      <DeleteMeshDialog />
    </div>
  )
}
