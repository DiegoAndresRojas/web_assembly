import { useMemo, useRef } from 'react'

import { CloseIcon, DownloadIcon, PlusIcon } from '@/components/icons'
import { triggerDownload } from '@/lib/download'
import { formatBytes, meshBytes, MESH_EXTS } from '@/lib/meshFiles'
import { useStore } from '@/store'
import type { MeshRecord, Project } from '@/types/project'

export interface MeshLibraryProps {
  project: Project
}

/** The name to save a library file under — its own, with its extension. */
function fileName(mesh: MeshRecord): string {
  const ext = '.' + mesh.ext
  return !mesh.ext || mesh.name.toLowerCase().endsWith(ext) ? mesh.name : mesh.name + ext
}

export function MeshLibrary({ project }: MeshLibraryProps) {
  const filterExt = useStore((s) => s.meshFilterExt)
  const setMeshFilter = useStore((s) => s.setMeshFilter)
  const importMeshFiles = useStore((s) => s.importMeshFiles)
  const notify = useStore((s) => s.notify)
  const working = useStore((s) => s.working)
  const askDeleteMesh = useStore((s) => s.askDeleteMesh)
  const inputRef = useRef<HTMLInputElement>(null)

  const exts = useMemo(
    () => Array.from(new Set(project.meshes.map((m) => m.ext))).filter(Boolean),
    [project.meshes],
  )
  const meshes = filterExt ? project.meshes.filter((m) => m.ext === filterExt) : project.meshes

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void importMeshFiles(project.id, files)
  }

  const onDownload = (mesh: MeshRecord) => {
    meshBytes(mesh)
      .then((data) => triggerDownload(new Blob([data]), fileName(mesh)))
      .catch((e: unknown) =>
        notify(`Could not download ${mesh.name}: ${e instanceof Error ? e.message : String(e)}.`),
      )
  }

  const onDragStartMesh = (e: React.DragEvent, mesh: MeshRecord) => {
    e.dataTransfer.setData('text/ms-mesh-id', mesh.id)
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label
          title="Load mesh"
          style={{
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-800)',
            color: 'var(--color-accent-100)',
          }}
        >
          <PlusIcon size={14} />
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={MESH_EXTS.map((ext) => '.' + ext).join(',')}
            style={{ display: 'none' }}
            onChange={onUpload}
          />
        </label>
        <div
          className="text-muted"
          role="status"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 10,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {working}
        </div>
        {exts.map((ext) => (
          <div
            key={ext}
            title={`Show only .${ext} files`}
            onClick={() => setMeshFilter(filterExt === ext ? null : ext)}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontFamily: 'ui-monospace, monospace',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              background:
                filterExt === ext ? 'var(--color-accent-800)' : 'var(--color-neutral-900)',
              color: filterExt === ext ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
            }}
          >
            {ext.toUpperCase()}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridAutoRows: 116,
          gap: 'var(--space-2)',
          alignContent: 'start',
          padding: 'var(--space-2)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-neutral-900)',
        }}
      >
        {meshes.map((m) => (
          <div
            key={m.id}
            draggable
            onDragStart={(e) => onDragStartMesh(e, m)}
            title={m.bytes ? `${m.name} — ${formatBytes(m.bytes)}` : m.name}
            style={{
              position: 'relative',
              aspectRatio: '1',
              cursor: 'grab',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: 'var(--color-bg)',
              display: 'grid',
              placeItems: 'center',
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--color-neutral-800), var(--color-neutral-800) 5px, transparent 5px, transparent 10px)',
            }}
          >
            <span
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 9,
                letterSpacing: '0.04em',
                color: 'var(--color-neutral-400)',
              }}
            >
              {m.ext.toUpperCase()}
            </span>
            {(m.hash || m.data) && (
              <button
                type="button"
                title={`Download ${fileName(m)}`}
                aria-label={`Download ${fileName(m)}`}
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(m)
                }}
                style={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  width: 17,
                  height: 17,
                  padding: 0,
                  border: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(22,24,38,0.72)',
                  color: 'var(--color-neutral-300)',
                  cursor: 'pointer',
                }}
              >
                <DownloadIcon size={10} />
              </button>
            )}
            <div
              title="Delete mesh"
              onClick={(e) => {
                e.stopPropagation()
                askDeleteMesh(m.id, m.name)
              }}
              style={{
                position: 'absolute',
                top: 3,
                right: 3,
                width: 17,
                height: 17,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(22,24,38,0.72)',
                color: 'var(--color-neutral-300)',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={10} />
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '3px 5px',
                fontSize: 9,
                lineHeight: 1.2,
                background: 'rgba(22,24,38,0.62)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {m.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
