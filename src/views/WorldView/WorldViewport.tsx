import { useEffect, useState, type DragEvent } from 'react'

import { IconButton } from '@/components/IconButton'
import { MoveIcon, RotateIcon } from '@/components/icons'
import { useWorldSession } from '@/hooks/useWorldSession'
import { useStore } from '@/store'
import type { WorldSession } from '@/lib/three/worldSession'

export interface WorldViewportProps {
  stageId: string
  onSession: (session: WorldSession | null) => void
}

export function WorldViewport({ stageId, onSession }: WorldViewportProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wmode = useStore((s) => s.wmode)
  const worldSelId = useStore((s) => s.worldSelId)
  const gizmoMode = useStore((s) => s.gizmoMode)
  const setGizmoMode = useStore((s) => s.setGizmoMode)
  const hint = useStore((s) => s.hint)
  const kpOn = useStore((s) => s.kpOn)
  const pendingPicks = useStore((s) => s.pendingPicks)

  const session = useWorldSession(container, stageId)
  useEffect(() => {
    onSession(session)
  }, [session, onSession])

  const showGizmoTools = (wmode === 'assembly' || wmode === 'animate') && !!worldSelId
  const onDragOver = (e: DragEvent) => e.preventDefault()

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <div
        ref={setContainer}
        style={{ position: 'absolute', inset: 0 }}
        onDragOver={onDragOver}
        onDrop={(e) => e.preventDefault()}
      />
      {showGizmoTools && (
        <div
          style={{
            position: 'absolute',
            right: 'var(--space-4)',
            top: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 4,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <IconButton
            size="md"
            active={gizmoMode === 'translate'}
            title="Move"
            onClick={() => setGizmoMode('translate')}
          >
            <MoveIcon size={17} />
          </IconButton>
          <IconButton
            size="md"
            active={gizmoMode === 'rotate'}
            title="Rotate"
            onClick={() => setGizmoMode('rotate')}
          >
            <RotateIcon size={17} />
          </IconButton>
        </div>
      )}
      <div
        className="text-muted"
        style={{
          position: 'absolute',
          left: 'var(--space-4)',
          bottom: 'var(--space-4)',
          fontSize: 11,
          pointerEvents: 'none',
        }}
      >
        {hint ||
          (wmode === 'assembly' && kpOn
            ? pendingPicks.length > 0
              ? 'Point 1 selected — click a point on a different mesh to link them.'
              : 'Click a point on a mesh to start a keypoint link.'
            : wmode === 'assembly'
              ? 'Drag to orbit. Click a mesh, then check Select keypoints to link two points.'
              : wmode === 'animate'
                ? 'Drag to orbit. Select a mesh to move it.'
                : 'Drag to orbit.')}
      </div>
    </div>
  )
}
