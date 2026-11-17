import { useRef } from 'react'

import { Button } from '@/components/Button'
import { PROJECT_FILE_EXT } from '@/lib/projectFile'
import { useStore } from '@/store'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectCard } from './ProjectCard'

/** `?viewer` in the address: the app only to follow assemblies — opened
 *  from a project file — with nothing that edits them. */
const VIEW_ONLY =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewer')

export function ProjectsView() {
  const projects = useStore((s) => s.projects)
  const createProject = useStore((s) => s.createProject)
  const openProject = useStore((s) => s.openProject)
  const askDeleteProject = useStore((s) => s.askDeleteProject)
  const exportProject = useStore((s) => s.exportProject)
  const importProject = useStore((s) => s.importProject)
  const openViewer = useStore((s) => s.openViewer)
  const working = useStore((s) => s.working)
  const fileInput = useRef<HTMLInputElement>(null)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="text-muted" role="status" style={{ fontSize: 12 }}>
            {working}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept={`.${PROJECT_FILE_EXT},.zip`}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importProject(file)
            }}
          />
          <Button
            variant="secondary"
            title="Open a project file exported from Mesh Studio"
            disabled={!!working}
            onClick={() => fileInput.current?.click()}
          >
            Import project
          </Button>
          {!VIEW_ONLY && (
            <Button variant="primary" onClick={handleNew}>
              New project
            </Button>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 var(--space-6) var(--space-8)' }}>
        <p className="text-muted" style={{ fontSize: 13, maxWidth: '52ch' }}>
          {VIEW_ONLY
            ? 'Import a project file to follow its assembly step by step.'
            : 'Each project holds a board of meshes and the assembly stages that connect them.'}
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
                viewOnly={VIEW_ONLY}
                onView={() => openViewer(p.id, 'projects')}
                onOpen={() => openProject(p.id)}
                onExport={() => void exportProject(p.id)}
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
            {!VIEW_ONLY && (
              <Button variant="primary" style={{ marginTop: 'var(--space-4)' }} onClick={handleNew}>
                New project
              </Button>
            )}
          </div>
        )}
      </div>

      <DeleteProjectDialog />
    </div>
  )
}
