import { Button } from '@/components/Button'
import type { Project } from '@/types/project'

export interface ProjectCardProps {
  project: Project
  /** Only to be watched: nothing that edits the project is offered. */
  viewOnly: boolean
  onView: () => void
  onOpen: () => void
  onExport: () => void
  onDelete: () => void
}

function stageCount(project: Project): number {
  return project.board.nodes.filter((n) => n.kind !== 'mesh').length
}

export function ProjectCard({
  project,
  viewOnly,
  onView,
  onOpen,
  onExport,
  onDelete,
}: ProjectCardProps) {
  const meshes = project.meshes.length
  const stages = stageCount(project)
  return (
    <div className="card elev-sm">
      <div className="card-kicker">Project</div>
      <div className="card-title">{project.name}</div>
      <div className="card-meta" style={{ gap: 'var(--space-3)' }}>
        <span>
          {meshes} {meshes === 1 ? 'mesh' : 'meshes'}
        </span>
        <span>
          {stages} {stages === 1 ? 'stage' : 'stages'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-2)',
        }}
      >
        {viewOnly ? (
          <Button variant="primary" onClick={onView}>
            View
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={onOpen}>
              Open
            </Button>
            <Button
              variant="secondary"
              title="Follow the assembly step by step, as someone you hand it to would"
              onClick={onView}
            >
              View
            </Button>
          </>
        )}
        {!viewOnly && (
          <>
            <Button
              variant="secondary"
              title="Save the project as one file, meshes included — a backup, or to open it elsewhere"
              onClick={onExport}
            >
              Export
            </Button>
            <Button variant="secondary" onClick={onDelete}>
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
