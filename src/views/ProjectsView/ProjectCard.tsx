import { Button } from '@/components/Button'
import type { Project } from '@/types/project'

export interface ProjectCardProps {
  project: Project
  onOpen: () => void
  onExport: () => void
  onDelete: () => void
}

function stageCount(project: Project): number {
  return project.board.nodes.filter((n) => n.kind !== 'mesh').length
}

export function ProjectCard({ project, onOpen, onExport, onDelete }: ProjectCardProps) {
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
        <Button variant="primary" onClick={onOpen}>
          Open
        </Button>
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
      </div>
    </div>
  )
}
