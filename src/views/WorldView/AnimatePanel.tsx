import { useState } from 'react'

import { Button } from '@/components/Button'
import {
  CameraTrackIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { assemblyParts, membersOf, type AssemblyPart } from '@/lib/graph'
import { formatClock, stageDuration } from '@/lib/timeline'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'
import { MemberRow } from './MemberRow'

export interface AnimatePanelProps {
  project: Project
  stageId: string
  stage: Stage
  session: WorldSession | null
}

/** One mesh inside an assembly input: it can get its own track, which
 *  moves it within the assembly. Draggable onto the timeline like a mesh. */
function PartRow({
  part,
  hasTrack,
  onAddTrack,
}: {
  part: AssemblyPart
  hasTrack: boolean
  onAddTrack: () => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/ms-node-id', part.key)}
      title={part.mesh.name}
      style={{
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '2px 0',
        paddingLeft: part.depth * 22,
      }}
    >
      <IconButton title="Create its track" active={hasTrack} onClick={onAddTrack}>
        <PlusIcon size={13} />
      </IconButton>
      {part.node.color && (
        <span
          style={{
            width: 8,
            height: 8,
            flex: 'none',
            borderRadius: '50%',
            background: part.node.color,
          }}
        />
      )}
      <span
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--color-accent-300)',
        }}
      >
        {part.mesh.ext.toUpperCase()}
      </span>
      <span className="text-muted" style={{ fontSize: 10 }}>
        :
      </span>
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
        {part.mesh.name}
      </span>
    </div>
  )
}

export function AnimatePanel({ project, stageId, stage, session }: AnimatePanelProps) {
  const playing = useStore((s) => s.playing)
  const playT = useStore((s) => s.playT)
  const onAnimPlay = useStore((s) => s.onAnimPlay)
  const onAnimReset = useStore((s) => s.onAnimReset)
  const openVideoAsk = useStore((s) => s.openVideoAsk)
  const addMeshTrack = useStore((s) => s.addMeshTrack)
  const addCameraTrack = useStore((s) => s.addCameraTrack)
  const onCamKill = useStore((s) => s.onCamKill)
  const removeMember = useStore((s) => s.removeMember)

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const camTrack = stage.tracks.find((t) => t.targetKind === 'camera')
  const rows = membersOf(project, stageId)
  const dur = stageDuration(stage)

  return (
    <>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Button variant="primary" style={{ flex: 1, fontSize: 11 }} onClick={onAnimPlay}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="secondary" style={{ fontSize: 11 }} onClick={onAnimReset}>
          Reset
        </Button>
      </div>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-2)',
        }}
      >
        <Button
          variant="secondary"
          style={{
            flex: 1,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onClick={openVideoAsk}
        >
          <DownloadIcon size={14} />
          <span>Download</span>
        </Button>
      </div>
      <div
        className="text-muted"
        style={{
          flex: 'none',
          fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
          marginTop: 'var(--space-2)',
        }}
      >
        {formatClock(playT)} / {formatClock(dur)}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          marginTop: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            height: 34,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
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
              color: 'var(--color-neutral-300)',
            }}
          >
            <CameraTrackIcon size={11} />
          </div>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 10,
              color: 'var(--color-accent-300)',
            }}
          >
            CAM
          </span>
          <span className="text-muted" style={{ fontSize: 10 }}>
            :
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11 }}>Camera</span>
          {!camTrack && (
            <IconButton
              title="Create the camera track"
              onClick={() => addCameraTrack(session?.getCameraPose())}
            >
              <PlusIcon size={13} />
            </IconButton>
          )}
          <IconButton
            title="Show / hide the camera body"
            active={!!stage.camera}
            onClick={() => stage.camera && session?.setCameraPose(stage.camera.pose)}
          >
            <EyeIcon size={13} />
          </IconButton>
          <IconButton title="Delete the camera" onClick={onCamKill}>
            <TrashIcon size={13} />
          </IconButton>
        </div>

        {rows.map((row) => {
          const member = stage.members.find((m) => m.nodeId === row.node.id)
          if (!member) return null
          const hasTrack = stage.tracks.some((t) => t.nodeId === row.node.id)
          const isAsm = !row.mesh
          const open = expanded.has(row.node.id)
          return (
            <div key={row.node.id}>
              <MemberRow
                member={member}
                input={row}
                onKill={() => removeMember(row.node.id)}
                leading={
                  <>
                    {isAsm && (
                      <IconButton
                        title={open ? 'Hide its meshes' : 'Show its meshes'}
                        onClick={() => toggleExpanded(row.node.id)}
                      >
                        <ChevronRightIcon
                          size={11}
                          style={{ transform: open ? 'rotate(90deg)' : undefined }}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      title={isAsm ? 'Create a track for the whole assembly' : 'Create its track'}
                      active={hasTrack}
                      onClick={() => addMeshTrack(row.node.id)}
                    >
                      <PlusIcon size={13} />
                    </IconButton>
                  </>
                }
              />
              {isAsm &&
                open &&
                assemblyParts(project, row.node.id).map((part) => (
                  <PartRow
                    key={part.key}
                    part={part}
                    hasTrack={stage.tracks.some((t) => t.nodeId === part.key)}
                    onAddTrack={() => addMeshTrack(part.key)}
                  />
                ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
