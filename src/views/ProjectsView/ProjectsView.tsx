import { useRef, useState, type DragEvent } from 'react'

import { Button } from '@/components/Button'
import { PROJECT_FILE_EXT } from '@/lib/projectFile'
import { useStore } from '@/store'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectCard } from './ProjectCard'

/** `?viewer` in the address: the app only to follow assemblies — opened
 *  from a project file — with nothing that edits them. */
const VIEW_ONLY =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewer')

/** From this many projects on, there is a box to find one by name. */
const SEARCH_FROM = 7

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

export function ProjectsView() {
  const projects = useStore((s) => s.projects)
  const createProject = useStore((s) => s.createProject)
  const openProject = useStore((s) => s.openProject)
  const renameProject = useStore((s) => s.renameProject)
  const duplicateProject = useStore((s) => s.duplicateProject)
  const askDeleteProject = useStore((s) => s.askDeleteProject)
  const exportProject = useStore((s) => s.exportProject)
  const importProject = useStore((s) => s.importProject)
  const openViewer = useStore((s) => s.openViewer)
  const working = useStore((s) => s.working)
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [dropping, setDropping] = useState(false)

  const handleNew = () => {
    const project = createProject()
    openProject(project.id)
  }

  // the one worked on last comes first
  const wanted = query.trim().toLowerCase()
  const listed = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((p) => !wanted || p.name.toLowerCase().includes(wanted))

  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDropping(false)
    const file = e.dataTransfer.files[0]
    if (file) void importProject(file)
  }

  return (
    <div
      style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false)
      }}
      onDrop={onDrop}
    >
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
          {projects.length >= SEARCH_FROM && (
            <input
              className="input"
              type="search"
              placeholder="Find a project"
              aria-label="Find a project by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 170 }}
            />
          )}
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
            title="Open a project file exported from Mesh Studio — or drop it on this page"
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
        <p className="text-muted" style={{ fontSize: 13, maxWidth: '60ch' }}>
          {VIEW_ONLY
            ? 'Import a project file to follow its assembly step by step.'
            : 'A project is a product to put together: its parts, the stages that assemble them, and the steps someone follows to do it.'}
        </p>

        {projects.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(264px, 1fr))',
              gap: 'var(--space-4)',
              marginTop: 'var(--space-6)',
            }}
          >
            {listed.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                viewOnly={VIEW_ONLY}
                onView={() => openViewer(p.id, 'projects')}
                onOpen={() => openProject(p.id)}
                onRename={(name) => renameProject(p.id, name)}
                onExport={() => void exportProject(p.id)}
                onDuplicate={() => duplicateProject(p.id)}
                onDelete={() => askDeleteProject(p.id, p.name)}
              />
            ))}
            {listed.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                No project is called that.
              </p>
            )}
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
            {VIEW_ONLY ? (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Import a project file, or drop it anywhere on this page.
              </p>
            ) : (
              <>
                <ol
                  className="text-muted"
                  style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: '1.2em' }}
                >
                  <li>Load the parts of your product (STL, OBJ or GLB files).</li>
                  <li>Put them together in assemblies, one after another.</li>
                  <li>Animate how each one goes in, and order the steps.</li>
                  <li>Hand the project file to whoever has to follow it.</li>
                </ol>
                <Button
                  variant="primary"
                  style={{ marginTop: 'var(--space-4)' }}
                  onClick={handleNew}
                >
                  New project
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {dropping && <div className="drop-veil">Drop a project file to import it</div>}
      <DeleteProjectDialog />
    </div>
  )
}
