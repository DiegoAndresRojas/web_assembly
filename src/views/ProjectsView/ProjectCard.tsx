import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { DownloadIcon, DuplicateIcon, PlayIcon, TrashIcon } from '@/components/icons'
import { MeshThumb } from '@/components/MeshThumb'
import { NameField } from '@/components/NameField'
import { timeAgo } from '@/lib/timeAgo'
import type { Project } from '@/types/project'

export interface ProjectCardProps {
  project: Project
  /** Only to be watched: nothing that edits the project is offered. */
  viewOnly: boolean
  onView: () => void
  onOpen: () => void
  onRename: (name: string) => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** How many of the library's meshes a card shows. */
const SHOWN = 4

export function ProjectCard({
  project,
  viewOnly,
  onView,
  onOpen,
  onRename,
  onExport,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const stages = project.board.nodes.filter((n) => n.kind !== 'mesh').length
  const shown = project.meshes.slice(0, SHOWN)
  const more = project.meshes.length - shown.length
  // the color a piece has on the board, if it is there
  const colorOf = (meshId: string) =>
    project.board.nodes.find((n) => n.kind === 'mesh' && n.meshId === meshId)?.color ?? null

  return (
    <div className="card elev-sm project-card">
      <button
        className="project-thumbs"
        title={viewOnly ? `View ${project.name}` : `Open ${project.name}`}
        onClick={viewOnly ? onView : onOpen}
      >
        {shown.length === 0 && (
          <span className="text-muted" style={{ fontSize: 11 }}>
            No meshes yet
          </span>
        )}
        {shown.map((mesh) => (
          <span key={mesh.id} className="project-thumb">
            <MeshThumb mesh={mesh} color={colorOf(mesh.id)} />
          </span>
        ))}
        {more > 0 && <span className="project-thumbs-more">+{more}</span>}
      </button>

      {viewOnly ? (
        <div className="card-title">{project.name}</div>
      ) : (
        <NameField
          label="Project name"
          value={project.name}
          onRename={onRename}
          style={{ fontSize: 15, fontWeight: 600 }}
        />
      )}
      <div className="card-meta" style={{ gap: 'var(--space-3)' }}>
        <span>{count(project.meshes.length, 'mesh', 'meshes')}</span>
        <span>{count(stages, 'stage', 'stages')}</span>
        <span>{count(project.steps.length, 'step', 'steps')}</span>
      </div>
      <div className="card-meta" style={{ marginTop: 2, minHeight: 14 }}>
        {project.updatedAt > 0 && (
          <span title={new Date(project.updatedAt).toLocaleString()}>
            Edited {timeAgo(project.updatedAt)}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
        }}
      >
        {!viewOnly && (
          <Button variant="primary" onClick={onOpen}>
            Open
          </Button>
        )}
        <Button
          variant={viewOnly ? 'primary' : 'secondary'}
          title="Follow the assembly step by step, as someone you hand it to would"
          onClick={onView}
        >
          <PlayIcon size={10} /> View
        </Button>
        <div style={{ flex: 1 }} />
        {!viewOnly && (
          <>
            <IconButton
              size="md"
              title="Export — save the project as one file, meshes included"
              aria-label="Export project"
              onClick={onExport}
            >
              <DownloadIcon size={15} />
            </IconButton>
            <IconButton
              size="md"
              title="Duplicate — a copy to try things on"
              aria-label="Duplicate project"
              onClick={onDuplicate}
            >
              <DuplicateIcon size={15} />
            </IconButton>
          </>
        )}
        <IconButton
          size="md"
          className="tool-btn--danger"
          title="Delete"
          aria-label="Delete project"
          onClick={onDelete}
        >
          <TrashIcon size={15} />
        </IconButton>
      </div>
    </div>
  )
}
