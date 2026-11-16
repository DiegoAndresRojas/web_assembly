import { useState } from 'react'

import { Button } from '@/components/Button'
import {
  CameraTrackIcon,
  EyeIcon,
  ImportIcon,
  LockIcon,
  LockOpenIcon,
  OpacityIcon,
  PlusIcon,
  RecordIcon,
  TrashIcon,
} from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { NameField } from '@/components/NameField'
import { recordCameraFromView } from '@/hooks/useShortcuts'
import { cameraSources } from '@/lib/cameras'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { assemblyParts, lockedKey, membersOf, type AssemblyPart } from '@/lib/graph'
import { isLightKey } from '@/lib/lights'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import type { PartLook, Project, Stage } from '@/types/project'
import { ImportCameraDialog } from './ImportCameraDialog'
import { ImportPosesDialog } from './ImportPosesDialog'
import { LightsPanel } from './LightsPanel'
import { MemberRow } from './MemberRow'

export interface AnimatePanelProps {
  project: Project
  stageId: string
  stage: Stage
  session: WorldSession | null
}

/** "Has a track" dot, or "+" to create one. */
function TrackButton({
  tracked,
  onCreate,
  onOpen,
}: {
  tracked: boolean
  onCreate: () => void
  onOpen: () => void
}) {
  return tracked ? (
    <IconButton title="Animated — show its initial pose on the timeline" active onClick={onOpen}>
      <RecordIcon size={9} />
    </IconButton>
  ) : (
    <IconButton title="Create its track" onClick={onCreate}>
      <PlusIcon size={13} />
    </IconButton>
  )
}

/** Opacity slider under a row (shared by parts; members have their own). */
function OpacitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '2px 4px 6px 26px',
      }}
    >
      <input
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--color-accent)' }}
      />
      <span
        className="text-muted"
        style={{
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          minWidth: 30,
          textAlign: 'right',
        }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

/** A piece inside an assembly input — selectable, animatable (its track
 *  moves it within the assembly), and shown / faded on its own. */
/** The lock of an assembly in the scene tree. Locked (the default), it is
 *  handled as one thing: a click on any of its pieces picks the assembly.
 *  Unlocked, its pieces are listed and can be picked and animated one by
 *  one — each assembly inside it with a lock of its own. */
function AsmLock({ assemblyKey }: { assemblyKey: string }) {
  const open = useStore((s) => s.asmOpen.includes(assemblyKey))
  const toggleAsmOpen = useStore((s) => s.toggleAsmOpen)
  return (
    <IconButton
      title={
        open
          ? 'Unlocked — its pieces can be picked and animated. Click to lock'
          : 'Locked — moves as one. Click to reach its pieces'
      }
      aria-expanded={open}
      active={open}
      onClick={() => toggleAsmOpen(assemblyKey)}
    >
      {open ? <LockOpenIcon size={13} /> : <LockIcon size={13} />}
    </IconButton>
  )
}

function PartRow({
  part,
  look,
  selected,
  tracked,
  onSelect,
  onCreate,
  onOpen,
}: {
  part: AssemblyPart
  look: PartLook | undefined
  selected: boolean
  tracked: boolean
  onSelect: () => void
  onCreate: () => void
  onOpen: () => void
}) {
  const opacityOpen = useStore((s) => s.opacityOpenId === part.key)
  const toggleOpacityUI = useStore((s) => s.toggleOpacityUI)
  const togglePartVisible = useStore((s) => s.togglePartVisible)
  const setPartOpacity = useStore((s) => s.setPartOpacity)
  const visible = look?.visible ?? true
  const opacity = look?.opacity ?? 1
  const name = part.mesh?.name ?? part.node.label ?? part.node.kind

  return (
    <div>
      <div
        className={'outline-row' + (selected ? ' outline-row--selected' : '')}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/ms-node-id', part.key)}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) onSelect()
        }}
        title={name}
        style={{ paddingLeft: 4 + part.depth * 16, opacity: visible ? 1 : 0.5 }}
      >
        {part.mesh ? (
          <span style={{ width: 20, flex: 'none' }} />
        ) : (
          <AsmLock assemblyKey={part.key} />
        )}
        <TrackButton tracked={tracked} onCreate={onCreate} onOpen={onOpen} />
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
          {part.mesh ? part.mesh.ext.toUpperCase() : 'ASM'}
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
          {name}
        </span>
        <IconButton
          title={visible ? 'Hide' : 'Show'}
          active={visible}
          onClick={() => togglePartVisible(part.key)}
        >
          <EyeIcon size={13} />
        </IconButton>
        <IconButton
          title={`Opacity ${Math.round(opacity * 100)}%`}
          active={opacityOpen || opacity < 1}
          onClick={() => toggleOpacityUI(part.key)}
        >
          <OpacityIcon size={13} />
        </IconButton>
      </div>
      {opacityOpen && (
        <OpacitySlider value={opacity} onChange={(v) => setPartOpacity(part.key, v)} />
      )}
    </div>
  )
}

/** The animation camera's row: select it (in the viewport too), look
 *  through it, shoot it from the current view, delete it. */
function CameraRow({
  project,
  stageId,
  stage,
  session,
}: {
  project: Project
  stageId: string
  stage: Stage
  session: WorldSession | null
}) {
  const [importing, setImporting] = useState(false)
  const setCameraName = useStore((s) => s.setCameraName)
  const sources = cameraSources(project, stageId)
  const worldSelId = useStore((s) => s.worldSelId)
  const cameraView = useStore((s) => s.cameraView)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const selectAction = useStore((s) => s.selectAction)
  const setCameraView = useStore((s) => s.setCameraView)
  const onCamKill = useStore((s) => s.onCamKill)
  const camTrack = stage.tracks.find((t) => t.targetKind === 'camera')

  const select = () => {
    if (!camTrack) return
    selectWorldObject(ANIM_CAMERA_KEY)
    selectAction({ trackId: camTrack.id, actionId: 'init' })
  }

  return (
    <div
      className={'outline-row' + (worldSelId === ANIM_CAMERA_KEY ? ' outline-row--selected' : '')}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) select()
      }}
      title={camTrack ? 'The animation camera — an object in the world' : undefined}
    >
      {camTrack ? (
        <IconButton
          title="Animated — show its initial pose on the timeline"
          active
          onClick={select}
        >
          <RecordIcon size={9} />
        </IconButton>
      ) : (
        <IconButton
          title="Create the animation camera where you are looking from"
          onClick={() => recordCameraFromView(session)}
        >
          <PlusIcon size={13} />
        </IconButton>
      )}
      <CameraTrackIcon size={13} style={{ color: 'var(--color-neutral-400)' }} />
      {camTrack && stage.camera ? (
        <NameField
          label="Camera name"
          value={stage.camera.name}
          onRename={setCameraName}
          style={{ flex: 1, fontSize: 11 }}
        />
      ) : (
        <span style={{ flex: 1, fontSize: 11, color: 'var(--color-neutral-500)' }}>
          Camera (none yet)
        </span>
      )}
      {sources.length > 0 && (
        <IconButton
          title="Import a camera — start from where another animation's camera is"
          aria-label="Import a camera from another animation"
          onClick={() => setImporting(true)}
        >
          <ImportIcon size={13} />
        </IconButton>
      )}
      {importing && (
        <ImportCameraDialog
          sources={sources}
          hasCamera={!!camTrack}
          onClose={() => setImporting(false)}
        />
      )}
      {camTrack && (
        <>
          <IconButton
            title="Shoot from here — the camera takes the view you're looking from (as an action at the playhead)"
            onClick={() => recordCameraFromView(session)}
          >
            <EyeIcon size={13} />
          </IconButton>
          <Button
            variant="ghost"
            className={cameraView ? 'btn--on' : ''}
            aria-pressed={cameraView}
            title={cameraView ? 'Back to your own view' : 'Look through the animation camera'}
            onClick={() => setCameraView(!cameraView)}
            style={{ height: 22, minHeight: 22, padding: '0 7px', fontSize: 10, gap: 4 }}
          >
            <CameraTrackIcon size={11} /> {cameraView ? 'Viewing' : 'View'}
          </Button>
        </>
      )}
      {stage.camera && (
        <IconButton title="Delete the camera" onClick={onCamKill}>
          <TrashIcon size={13} />
        </IconButton>
      )}
    </div>
  )
}

/** The animate aside: the scene as a tree — the animation camera, every
 *  input, and the pieces inside assembly inputs. Selecting a row selects
 *  the piece in the viewport (and the other way round). */
export function AnimatePanel({ project, stageId, stage, session }: AnimatePanelProps) {
  const worldSelId = useStore((s) => s.worldSelId)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const selectAction = useStore((s) => s.selectAction)
  const addMeshTrack = useStore((s) => s.addMeshTrack)
  const removeMember = useStore((s) => s.removeMember)
  const asmOpen = useStore((s) => s.asmOpen)
  const [importingPoses, setImportingPoses] = useState(false)
  const trackOf = (key: string) => stage.tracks.find((t) => t.nodeId === key)
  const openTrack = (key: string) => {
    const t = trackOf(key)
    selectWorldObject(key)
    if (t) selectAction({ trackId: t.id, actionId: 'init' })
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
      <div style={{ flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div className="tl-section-title" style={{ flex: 1 }}>
            Scene
          </div>
          <Button
            variant="ghost"
            title="Start the pieces where another animation has them"
            onClick={() => setImportingPoses(true)}
            style={{ height: 22, minHeight: 22, padding: '0 7px', fontSize: 10, gap: 4 }}
          >
            <ImportIcon size={11} /> Import positions
          </Button>
        </div>
        {importingPoses && (
          <ImportPosesDialog
            project={project}
            stageId={stageId}
            selectedKey={
              worldSelId && worldSelId !== ANIM_CAMERA_KEY && !isLightKey(worldSelId)
                ? worldSelId
                : null
            }
            onClose={() => setImportingPoses(false)}
          />
        )}
        <div className="text-muted" style={{ fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>
          Click a piece (here or in the viewport), move it with the gizmo, then <b>Record pose</b>{' '}
          (K). An assembly moves as one until you open its lock; then its pieces can be picked.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <CameraRow project={project} stageId={stageId} stage={stage} session={session} />

        {membersOf(project, stageId).map((row) => {
          const member = stage.members.find((m) => m.nodeId === row.node.id)
          if (!member) return null
          const key = row.node.id
          const isAsm = !row.mesh
          return (
            <div key={key}>
              <MemberRow
                member={member}
                input={row}
                selected={worldSelId === key}
                onSelect={() => selectWorldObject(key)}
                onKill={() => removeMember(key)}
                leading={
                  <>
                    {isAsm ? (
                      <AsmLock assemblyKey={key} />
                    ) : (
                      <span style={{ width: 20, flex: 'none' }} />
                    )}
                    <TrackButton
                      tracked={!!trackOf(key)}
                      onCreate={() => addMeshTrack(key)}
                      onOpen={() => openTrack(key)}
                    />
                  </>
                }
              />
              {isAsm &&
                assemblyParts(project, key)
                  // listed once every assembly holding it is unlocked
                  .filter((part) => lockedKey(part.key, asmOpen) === part.key)
                  .map((part) => (
                    <PartRow
                      key={part.key}
                      part={part}
                      look={stage.partLooks?.[part.key]}
                      selected={worldSelId === part.key}
                      tracked={!!trackOf(part.key)}
                      onSelect={() => selectWorldObject(part.key)}
                      onCreate={() => addMeshTrack(part.key)}
                      onOpen={() => openTrack(part.key)}
                    />
                  ))}
            </div>
          )
        })}
      </div>

      <LightsPanel project={project} stageId={stageId} stage={stage} session={session} />
    </div>
  )
}
