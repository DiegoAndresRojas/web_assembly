import { CameraTrackIcon, PlusIcon, TrashIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { inputLabel, meshForNodeId, PART_SEP } from '@/lib/graph'
import { PX_PER_SECOND } from '@/lib/constants'
import { useStore } from '@/store'
import type { Project, Track } from '@/types/project'

export interface TrackLaneProps {
  project: Project
  track: Track
}

export function TrackLabel({ project, track }: TrackLaneProps) {
  const removeTrack = useStore((s) => s.removeTrack)
  const openInitEditor = useStore((s) => s.openInitEditor)
  const onAddAction = useStore((s) => s.openNewAction)
  const isCam = track.targetKind === 'camera'
  // a part key (`asm/mesh`) ends in the mesh's own node id
  const mesh = isCam ? null : meshForNodeId(project, track.nodeId?.split(PART_SEP).pop() ?? null)

  return (
    <div
      style={{
        height: 34,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0 var(--space-2)',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 2,
          background: 'var(--color-neutral-800)',
          color: 'var(--color-accent-300)',
          fontSize: 8,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {isCam ? <CameraTrackIcon size={11} /> : (mesh?.ext.toUpperCase().slice(0, 3) ?? 'ASM')}
      </div>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {isCam ? 'Camera' : inputLabel(project, track.nodeId)}
      </span>
      <IconButton title="Initial pose" onClick={() => openInitEditor(track.id)}>
        i
      </IconButton>
      <IconButton title="Add action" onClick={() => onAddAction(track.id)}>
        <PlusIcon size={12} />
      </IconButton>
      <IconButton title="Remove track" onClick={() => removeTrack(track.id)}>
        <TrashIcon size={11} />
      </IconButton>
    </div>
  )
}

export function TrackActions({ track }: { track: Track }) {
  const openAction = useStore((s) => s.openAction)
  return (
    <div
      style={{
        height: 34,
        position: 'relative',
        boxShadow: 'inset 0 -1px 0 var(--color-neutral-900)',
      }}
    >
      {track.actions.map((a) => (
        <div
          key={a.id}
          onPointerDown={() => openAction(track.id, a.id)}
          style={{
            position: 'absolute',
            top: 3,
            left: a.start * PX_PER_SECOND,
            width: Math.max(6, a.duration * PX_PER_SECOND),
            height: 28,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-800)',
            color: 'var(--color-accent-100)',
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
            cursor: 'pointer',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {a.duration.toFixed(1)}s
        </div>
      ))}
    </div>
  )
}
