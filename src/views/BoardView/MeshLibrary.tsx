import { useMemo, useRef } from 'react'

import { CloseIcon, DownloadIcon, PlusIcon } from '@/components/icons'
import { downloadDataUrl } from '@/lib/download'
import { useStore } from '@/store'
import type { MeshRecord, Project } from '@/types/project'

export interface MeshLibraryProps {
  project: Project
}

function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/** The name to save a library file under — its own, with its extension. */
function fileName(mesh: MeshRecord): string {
  const ext = '.' + mesh.ext
  return !mesh.ext || mesh.name.toLowerCase().endsWith(ext) ? mesh.name : mesh.name + ext
}

export function MeshLibrary({ project }: MeshLibraryProps) {
  const filterExt = useStore((s) => s.meshFilterExt)
  const setMeshFilter = useStore((s) => s.setMeshFilter)
  const addMeshes = useStore((s) => s.addMeshes)
  const askDeleteMesh = useStore((s) => s.askDeleteMesh)
  const inputRef = useRef<HTMLInputElement>(null)

  const exts = useMemo(
    () => Array.from(new Set(project.meshes.map((m) => m.ext))).filter(Boolean),
    [project.meshes],
  )
  const meshes = filterExt ? project.meshes.filter((m) => m.ext === filterExt) : project.meshes

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const results = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        ext: (f.name.split('.').pop() ?? '').toLowerCase(),
        data: f.size < 8e6 ? await readAsDataUrl(f) : null,
      })),
    )
    if (results.length) addMeshes(project.id, results)
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
            accept=".glb,.gltf,.obj,.stl"
            style={{ display: 'none' }}
            onChange={onUpload}
          />
        </label>
        <div style={{ flex: 1 }} />
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
            title={m.name}
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
            {m.data && (
              <button
                type="button"
                title={`Download ${fileName(m)}`}
                aria-label={`Download ${fileName(m)}`}
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  void downloadDataUrl(m.data!, fileName(m))
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
