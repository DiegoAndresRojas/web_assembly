import type { ReactNode } from 'react'

import { Button } from '@/components/Button'
import { CloseIcon, DuplicateIcon, TrashIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { effectiveTrack } from '@/lib/chain'
import { inputLabel, restPoseOf } from '@/lib/graph'
import { readPose } from '@/lib/three/buildMesh'
import type { WorldSession } from '@/lib/three/worldSession'
import { clampActionMove, clampActionResize, resolveActions } from '@/lib/timeline'
import { EASES } from '@/lib/migrations'
import { useStore } from '@/store'
import type { Ease, Pose, Project, Stage } from '@/types/project'
import { NumberField, PoseFields } from './NumberField'
import { EASE_LABEL } from './timelineRows'

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="tl-section-title" style={{ flex: 1 }}>
          {title}
        </span>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Check({
  checked,
  disabled,
  label,
  title,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  title: string
  onChange: (v: boolean) => void
}) {
  return (
    <label
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        color: 'var(--color-neutral-300)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

const smallBtn = { fontSize: 11, padding: '3px 8px' }

/** Right-hand panel of the timeline: edits the selected action (or a
 *  track's initial pose) live — every change shows in the viewport at once
 *  and is undoable. */
export function ActionInspector({
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
  const selection = useStore((s) => s.selection)
  const selectAction = useStore((s) => s.selectAction)
  const beginEdit = useStore((s) => s.beginEdit)
  const updateAction = useStore((s) => s.updateAction)
  const setInitPose = useStore((s) => s.setInitPose)
  const setInitLinked = useStore((s) => s.setInitLinked)
  const duplicateAction = useStore((s) => s.duplicateAction)
  const deleteAction = useStore((s) => s.deleteAction)

  const track = selection ? stage.tracks.find((t) => t.id === selection.trackId) : undefined
  if (!selection || !track) return null

  const isCam = track.targetKind === 'camera'
  const key = track.nodeId
  const rest = key ? restPoseOf(project, stageId, key) : null
  // the track as it plays: a followed start resolved to an actual pose
  const playing = effectiveTrack(project, stageId, track)
  // where a pose can be taken from: the piece (or the camera object) as
  // the gizmo left it, or — for the camera — the view you're looking from
  const poseFrom = (source: 'object' | 'view'): Pose | null => {
    if (!session) return null
    if (source === 'view') return session.getCameraPose()
    if (isCam) return session.getAnimCameraPose()
    const obj = key ? session.getObject(key) : null
    return obj ? readPose(obj) : null
  }
  const take = (source: 'object' | 'view', apply: (p: Pose) => void) => {
    const p = poseFrom(source)
    if (!p) return
    beginEdit()
    apply(p)
  }
  const poseButtons = (apply: (p: Pose) => void) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button
        variant="secondary"
        style={smallBtn}
        title={
          isCam
            ? "Take the camera object's pose (move it with the gizmo first)"
            : 'Take the pose the piece has in the viewport (move it with the gizmo first)'
        }
        onClick={() => take('object', apply)}
      >
        {isCam ? 'Use camera object' : 'Use viewport pose'}
      </Button>
      {isCam && (
        <Button
          variant="secondary"
          style={smallBtn}
          title="Take the view you are looking from"
          onClick={() => take('view', apply)}
        >
          From my view
        </Button>
      )}
    </div>
  )

  const header = (subtitle: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {isCam ? (stage.camera?.name ?? 'Camera') : inputLabel(project, key)}
        </div>
        <div className="text-muted" style={{ fontSize: 10 }}>
          {subtitle}
        </div>
      </div>
      <IconButton title="Close" onClick={() => selectAction(null)}>
        <CloseIcon size={10} />
      </IconButton>
    </div>
  )

  if (selection.actionId === 'init') {
    return (
      <div className="tl-inspector">
        {header('Initial pose — where the track starts')}
        <Section
          title="Pose"
          aside={
            isCam ? undefined : (
              <Check
                checked={track.initLinked}
                label="Where the piece is"
                title="Start where the assembly put the piece, or where the last animation before this one left it — and keep following it when those change"
                onChange={(v) => {
                  beginEdit()
                  setInitLinked(track.id, v)
                }}
              />
            )
          }
        >
          {/* editing a followed pose by hand stops following it */}
          <PoseFields pose={playing.initPose} onChange={(p) => setInitPose(track.id, p)} />
          {poseButtons((p) => setInitPose(track.id, p))}
        </Section>
      </div>
    )
  }

  const resolved = resolveActions(playing, rest).find((r) => r.action.id === selection.actionId)
  if (!resolved) return null
  const { action, from, to } = resolved
  const patch = updateAction.bind(null, track.id, action.id)

  return (
    <div className="tl-inspector">
      {header('Move action')}

      <Section title="Timing">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <NumberField
            label="Start"
            value={action.start}
            width={60}
            onChange={(v) => patch({ start: clampActionMove(track, action.id, v) })}
          />
          <NumberField
            label="Length"
            value={action.duration}
            width={60}
            onChange={(v) => patch(clampActionResize(track, action.id, 'end', action.start + v))}
          />
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: 'var(--color-neutral-400)',
          }}
        >
          Easing
          <select
            className="input"
            value={action.ease}
            style={{ height: 26, minHeight: 26, fontSize: 11, padding: '0 6px', flex: 1 }}
            onChange={(e) => {
              beginEdit()
              patch({ ease: e.target.value as Ease })
            }}
          >
            {EASES.map((ease) => (
              <option key={ease} value={ease}>
                {EASE_LABEL[ease]}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section
        title="Start pose"
        aside={
          <Check
            checked={action.fromLinked}
            label="Continue from previous"
            title="Start wherever the track is when this action begins"
            onChange={(v) => {
              beginEdit()
              patch({ fromLinked: v })
            }}
          />
        }
      >
        <PoseFields
          pose={from}
          disabled={action.fromLinked}
          onChange={(p) => patch({ fromPose: p })}
        />
        {!action.fromLinked && poseButtons((p) => patch({ fromPose: p }))}
      </Section>

      <Section
        title="End pose"
        aside={
          !isCam && (
            <Check
              checked={action.toLinked}
              disabled={!rest}
              label="To connector"
              title="End where the assembly's connectors put the piece"
              onChange={(v) => {
                beginEdit()
                patch({ toLinked: v })
              }}
            />
          )
        }
      >
        <PoseFields pose={to} disabled={action.toLinked} onChange={(p) => patch({ toPose: p })} />
        {!action.toLinked && poseButtons((p) => patch({ toPose: p }))}
      </Section>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <Button
          variant="secondary"
          style={{ ...smallBtn, gap: 5 }}
          title="Duplicate (Ctrl+D)"
          onClick={() => duplicateAction(track.id, action.id)}
        >
          <DuplicateIcon size={12} /> Duplicate
        </Button>
        <Button
          variant="ghost"
          style={{ ...smallBtn, gap: 5 }}
          title="Delete (Del)"
          onClick={() => deleteAction(track.id, action.id)}
        >
          <TrashIcon size={12} /> Delete
        </Button>
      </div>
    </div>
  )
}
