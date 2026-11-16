import { useEffect, useState, type DragEvent } from 'react'

import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/Button'
import {
  ArrowUpIcon,
  CameraTrackIcon,
  CloseIcon,
  EyeIcon,
  MoveIcon,
  RecordIcon,
  RotateIcon,
} from '@/components/icons'
import { recordCameraFromView, recordFromViewport } from '@/hooks/useShortcuts'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { useWorldSession } from '@/hooks/useWorldSession'
import { parentKey } from '@/lib/graph'
import { useStore } from '@/store'
import type { WorldSession } from '@/lib/three/worldSession'

export interface WorldViewportProps {
  stageId: string
  onSession: (session: WorldSession | null) => void
}

function hintFor(
  wmode: string,
  kpOn: boolean,
  pendingPicks: number,
  lookingThrough: boolean,
): string {
  if (wmode === 'assembly') {
    if (kpOn) {
      return pendingPicks > 0
        ? 'Point 1 selected — click a point on a different mesh to link them.'
        : 'Click a point on a mesh to start a keypoint link.'
    }
    return 'Drag to orbit. Click a mesh, then check Select keypoints to link two points.'
  }
  if (lookingThrough)
    return 'Previewing through the animation camera — scrub or play to see the shot.'
  return 'Click to select — a locked assembly is picked whole; open its lock to reach its pieces. Move it, then Record pose (K).'
}

export function WorldViewport({ stageId, onSession }: WorldViewportProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wmode = useStore((s) => s.wmode)
  const worldSelId = useStore((s) => s.worldSelId)
  const gizmoMode = useStore((s) => s.gizmoMode)
  const setGizmoMode = useStore((s) => s.setGizmoMode)
  const selectParentPiece = useStore((s) => s.selectParentPiece)
  const hint = useStore((s) => s.hint)
  const kpOn = useStore((s) => s.kpOn)
  const pendingPicks = useStore((s) => s.pendingPicks)
  const cameraView = useStore((s) => s.cameraView)
  const setCameraView = useStore((s) => s.setCameraView)
  const hasCamTrack = useStore(
    (s) =>
      !!s.projects
        .find((p) => p.id === s.pid)
        ?.stages[stageId]?.tracks.some((t) => t.targetKind === 'camera'),
  )

  const session = useWorldSession(container, stageId)
  useEffect(() => {
    onSession(session)
  }, [session, onSession])

  const lookingThrough = wmode === 'animate' && cameraView && hasCamTrack
  const showGizmoTools = !!worldSelId && !lookingThrough
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
          {worldSelId && parentKey(worldSelId) && (
            <IconButton
              size="md"
              title="Select the assembly holding it (Esc)"
              onClick={selectParentPiece}
            >
              <ArrowUpIcon size={16} />
            </IconButton>
          )}
          {wmode === 'animate' && worldSelId === ANIM_CAMERA_KEY && (
            <IconButton
              size="md"
              title="Shoot from here — the camera takes the view you're looking from"
              onClick={() => recordCameraFromView(session)}
            >
              <EyeIcon size={15} />
            </IconButton>
          )}
          {wmode === 'animate' && (
            <IconButton
              size="md"
              title="Record pose into an action (K)"
              onClick={() => recordFromViewport(session)}
            >
              <RecordIcon size={14} style={{ color: '#e06a6a' }} />
            </IconButton>
          )}
        </div>
      )}
      {lookingThrough && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <span className="mode-pill">
            <CameraTrackIcon size={12} /> Looking through the animation camera
            <Button
              variant="ghost"
              title="Back to your own view"
              onClick={() => setCameraView(false)}
              style={{
                height: 20,
                minHeight: 20,
                padding: '0 6px',
                fontSize: 10,
                gap: 4,
                color: '#fff',
              }}
            >
              <CloseIcon size={8} /> Exit
            </Button>
          </span>
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
        {hint || hintFor(wmode, kpOn, pendingPicks.length, lookingThrough)}
      </div>
    </div>
  )
}
