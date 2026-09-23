import { Button } from '@/components/Button'
import { useStore } from '@/store'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectCard } from './ProjectCard'

export function ProjectsView() {
  const projects = useStore((s) => s.projects)
  const createProject = useStore((s) => s.createProject)
  const openProject = useStore((s) => s.openProject)
  const askDeleteProject = useStore((s) => s.askDeleteProject)

  const handleNew = () => {
    const project = createProject()
    openProject(project.id)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div
        className="nav"
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: 'var(--space-8) var(--space-6) var(--space-4)',
        }}
      >
        <div className="nav-brand">Mesh Studio</div>
        <Button variant="primary" onClick={handleNew}>
          New project
        </Button>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 var(--space-6) var(--space-8)' }}>
        <p className="text-muted" style={{ fontSize: 13, maxWidth: '52ch' }}>
          Each project holds a board of meshes and the assembly stages that connect them.
        </p>

        {projects.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
              gap: 'var(--space-4)',
              marginTop: 'var(--space-6)',
            }}
          >
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => openProject(p.id)}
                onDelete={() => askDeleteProject(p.id, p.name)}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: 'var(--space-6)',
              padding: 'var(--space-8)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
              background: 'var(--color-surface)',
            }}
          >
            <h4 style={{ margin: '0 0 var(--space-2)' }}>No projects yet</h4>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              Create one to start loading meshes onto a board.
            </p>
            <Button variant="primary" style={{ marginTop: 'var(--space-4)' }} onClick={handleNew}>
              New project
            </Button>
          </div>
        )}
      </div>

      <DeleteProjectDialog />
    </div>
  )
}
