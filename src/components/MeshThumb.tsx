import { useEffect, useState } from 'react'

import { meshThumbnail } from '@/lib/thumbnails'
import type { MeshRecord } from '@/types/project'

export interface MeshThumbProps {
  mesh: MeshRecord | null
  /** The color the piece is shown in (null: as its file has it). */
  color?: string | null
}

/** A picture of a mesh filling its box; until it is ready (or if it cannot
 *  be made) the file's format, as text. */
export function MeshThumb({ mesh, color = null }: MeshThumbProps) {
  const [picture, setPicture] = useState<{ of: string; url: string | null } | null>(null)
  const of = mesh ? `${mesh.id}|${mesh.hash ?? ''}|${color ?? ''}` : ''

  useEffect(() => {
    if (!mesh) return
    let current = true
    void meshThumbnail(mesh, color).then((url) => {
      if (current) setPicture({ of, url })
    })
    return () => {
      current = false
    }
    // (`of` says everything about the mesh that the picture depends on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [of])

  const url = picture?.of === of ? picture.url : null
  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        letterSpacing: '0.04em',
        color: 'var(--color-neutral-400)',
      }}
    >
      {mesh?.ext.toUpperCase() ?? ''}
    </span>
  )
}
