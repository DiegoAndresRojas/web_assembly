import { useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/Button'
import {
  DuplicateIcon,
  EyeIcon,
  ImportIcon,
  LightIcon,
  PlusIcon,
  RecordIcon,
  TrashIcon,
} from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { NameField } from '@/components/NameField'
import {
  DEFAULT_BOUNDS,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_LABEL,
  ENVIRONMENT_PRESETS,
  isAimed,
  isPosed,
  LIGHT_KIND_HINT,
  LIGHT_KIND_LABEL,
  LIGHT_KINDS,
  LIGHT_PRESET_LABEL,
  LIGHT_PRESETS,
  LIGHT_TAG,
  lightForKey,
  lightKey,
  lightSources,
  lightTrack,
  newFloor,
  type LightPreset,
} from '@/lib/lights'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { NumberField, PoseFields } from '@/views/TimelineView/NumberField'
import type {
  EnvironmentPreset,
  LightKind,
  Project,
  Stage,
  StageFloor,
  StageLight,
} from '@/types/project'
import { ImportLightsDialog } from './ImportLightsDialog'

/** One undo step per gesture: `touch` before each live change (opens the
 *  step the first time), `done` when the gesture ends. */
function useEditStep() {
  const beginEdit = useStore((s) => s.beginEdit)
  const open = useRef(false)
  return {
    touch: () => {
      if (!open.current) beginEdit()
      open.current = true
    },
    done: () => {
      open.current = false
    },
  }
}

const labelStyle = { width: 58, flex: 'none', fontSize: 10, color: 'var(--color-neutral-400)' }
const rowStyle = { display: 'flex', alignItems: 'center', gap: 6, minHeight: 22 }
const menuStyle = { height: 22, minHeight: 22, padding: '0 4px', fontSize: 10 }

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const edit = useEditStep()
  return (
    <label style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          edit.touch()
          onChange(Number(e.target.value))
        }}
        onPointerUp={edit.done}
        onKeyUp={edit.done}
        onBlur={edit.done}
        style={{ flex: 1, minWidth: 0, accentColor: 'var(--color-accent)' }}
      />
      <span
        className="text-muted"
        style={{
          fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          minWidth: 34,
          textAlign: 'right',
        }}
      >
        {format(value)}
      </span>
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const edit = useEditStep()
  return (
    <label style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          edit.touch()
          onChange(e.target.value)
        }}
        onBlur={edit.done}
        style={{ width: 34, height: 22, padding: 0, border: 'none', background: 'none' }}
      />
      <span className="text-muted" style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
        {value}
      </span>
    </label>
  )
}

function Block({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="tl-section-title" style={{ flex: 1 }}>
          {title}
        </span>
        {aside}
      </div>
      {children}
    </div>
  )
}

const pct = (v: number) => Math.round(v * 100) + '%'

function LightRow({ stage, light }: { stage: Stage; light: StageLight }) {
  const key = lightKey(light.id)
  const selected = useStore((s) => s.worldSelId === key)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const selectAction = useStore((s) => s.selectAction)
  const beginEdit = useStore((s) => s.beginEdit)
  const updateLight = useStore((s) => s.updateLight)
  const addLightTrack = useStore((s) => s.addLightTrack)
  const duplicateLight = useStore((s) => s.duplicateLight)
  const removeLight = useStore((s) => s.removeLight)
  const track = lightTrack(stage, light.id)

  return (
    <div
      className={'outline-row' + (selected ? ' outline-row--selected' : '')}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) selectWorldObject(key)
      }}
      title={LIGHT_KIND_HINT[light.kind]}
      style={{ opacity: light.visible ? 1 : 0.55 }}
    >
      {track ? (
        <IconButton
          title="On the timeline — show where it starts"
          active
          onClick={() => {
            selectWorldObject(key)
            selectAction({ trackId: track.id, actionId: 'init' })
          }}
        >
          <RecordIcon size={9} />
        </IconButton>
      ) : (
        <IconButton
          title="Put it on the timeline — to move it or change its intensity over time"
          onClick={() => addLightTrack(light.id)}
        >
          <PlusIcon size={13} />
        </IconButton>
      )}
      <span
        style={{
          width: 9,
          height: 9,
          flex: 'none',
          borderRadius: '50%',
          background: light.color,
          boxShadow: '0 0 0 1px var(--color-neutral-700)',
        }}
      />
      <span
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--color-accent-300)',
        }}
      >
        {LIGHT_TAG[light.kind]}
      </span>
      <NameField
        label="Light name"
        value={light.name}
        onRename={(name) => {
          beginEdit()
          updateLight(light.id, { name })
        }}
        style={{ flex: 1, minWidth: 0, fontSize: 11 }}
      />
      <IconButton
        title={light.visible ? 'Switch off' : 'Switch on'}
        active={light.visible}
        onClick={() => {
          beginEdit()
          updateLight(light.id, { visible: !light.visible })
        }}
      >
        <EyeIcon size={13} />
      </IconButton>
      <IconButton title="Duplicate" onClick={() => duplicateLight(light.id)}>
        <DuplicateIcon size={12} />
      </IconButton>
      <IconButton title="Delete the light" onClick={() => removeLight(light.id)}>
        <TrashIcon size={13} />
      </IconButton>
    </div>
  )
}

/** Everything about the selected light. */
function LightProps({
  stage,
  light,
  session,
}: {
  stage: Stage
  light: StageLight
  session: WorldSession | null
}) {
  const beginEdit = useStore((s) => s.beginEdit)
  const updateLight = useStore((s) => s.updateLight)
  const aimLight = useStore((s) => s.aimLight)
  const tracked = !!lightTrack(stage, light.id)
  const set = (patch: Partial<StageLight>) => updateLight(light.id, patch)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 6px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-neutral-900)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600 }}>
        {light.name}{' '}
        <span className="text-muted" style={{ fontWeight: 400 }}>
          — {LIGHT_KIND_LABEL[light.kind].toLowerCase()} light
        </span>
      </div>
      <Slider
        label={tracked ? 'Starts at' : 'Intensity'}
        value={light.intensity}
        min={0}
        max={5}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(intensity) => set({ intensity })}
      />
      <ColorField label="Color" value={light.color} onChange={(color) => set({ color })} />
      {light.kind === 'spot' && (
        <>
          <Slider
            label="Cone"
            value={light.angle}
            min={5}
            max={80}
            step={1}
            format={(v) => Math.round(v) + '°'}
            onChange={(angle) => set({ angle })}
          />
          <Slider
            label="Soft edge"
            value={light.penumbra}
            min={0}
            max={1}
            step={0.05}
            format={pct}
            onChange={(penumbra) => set({ penumbra })}
          />
        </>
      )}
      {(light.kind === 'spot' || light.kind === 'point') && (
        <div style={rowStyle} title="How far the light reaches, in world units (0: no limit)">
          <span style={labelStyle}>Reach</span>
          <NumberField
            value={light.distance}
            step={0.5}
            onChange={(distance) => set({ distance })}
          />
          <span className="text-muted" style={{ fontSize: 10 }}>
            {light.distance > 0 ? 'units' : 'no limit'}
          </span>
        </div>
      )}
      {isPosed(light.kind) && (
        <label style={{ ...rowStyle, fontSize: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={light.castShadow}
            onChange={(e) => {
              beginEdit()
              set({ castShadow: e.target.checked })
            }}
          />
          Casts shadows
          {light.kind === 'point' && light.castShadow && (
            <span className="text-muted">(the costliest kind)</span>
          )}
        </label>
      )}
      {isPosed(light.kind) &&
        (tracked ? (
          <div className="text-muted" style={{ fontSize: 10, lineHeight: 1.5 }}>
            On the timeline: move it with the gizmo and press <b>K</b> to record where it goes.
          </div>
        ) : (
          <>
            <PoseFields pose={light.pose} onChange={(pose) => set({ pose })} />
            {isAimed(light.kind) && (
              <Button
                variant="secondary"
                title="Turn it, where it is, to shine at the middle of the pieces"
                onClick={() =>
                  aimLight(light.id, (session?.sceneBounds() ?? DEFAULT_BOUNDS).center)
                }
                style={{ alignSelf: 'flex-start', fontSize: 11, padding: '3px 8px' }}
              >
                Aim at the pieces
              </Button>
            )}
          </>
        ))}
    </div>
  )
}

function EnvironmentBlock({ stage }: { stage: Stage }) {
  const beginEdit = useStore((s) => s.beginEdit)
  const setEnvironment = useStore((s) => s.setEnvironment)
  const env = stage.environment
  return (
    <Block
      title="Environment"
      aside={
        <select
          className="input"
          aria-label="Environment"
          title="Soft light and reflections from all around — never visible itself"
          value={env?.preset ?? ''}
          style={{ ...menuStyle, width: 110 }}
          onChange={(e) => {
            beginEdit()
            const preset = e.target.value as EnvironmentPreset | ''
            setEnvironment(preset ? { ...(env ?? DEFAULT_ENVIRONMENT), preset } : null)
          }}
        >
          <option value="">None</option>
          {ENVIRONMENT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {ENVIRONMENT_LABEL[preset]}
            </option>
          ))}
        </select>
      }
    >
      {env && (
        <>
          <Slider
            label="Strength"
            value={env.intensity}
            min={0}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(intensity) => setEnvironment({ ...env, intensity })}
          />
          <Slider
            label="Turn"
            value={env.rotation}
            min={0}
            max={360}
            step={5}
            format={(v) => Math.round(v) + '°'}
            onChange={(rotation) => setEnvironment({ ...env, rotation })}
          />
        </>
      )}
    </Block>
  )
}

function FloorBlock({ stage, session }: { stage: Stage; session: WorldSession | null }) {
  const beginEdit = useStore((s) => s.beginEdit)
  const setFloor = useStore((s) => s.setFloor)
  const floor = stage.floor
  const bounds = () => session?.sceneBounds() ?? DEFAULT_BOUNDS
  const commit = (next: StageFloor | null) => {
    beginEdit()
    setFloor(next)
  }
  const shadowsOn = stage.lights.some((l) => l.visible && l.castShadow)

  return (
    <Block
      title="Floor"
      aside={
        floor ? (
          <>
            <IconButton
              title={floor.visible ? 'Hide' : 'Show'}
              active={floor.visible}
              onClick={() => commit({ ...floor, visible: !floor.visible })}
            >
              <EyeIcon size={13} />
            </IconButton>
            <IconButton title="Remove the floor" onClick={() => commit(null)}>
              <TrashIcon size={13} />
            </IconButton>
          </>
        ) : (
          <Button
            variant="ghost"
            title="A ground under the pieces, for their shadows to fall on"
            onClick={() => commit(newFloor(bounds()))}
            style={{ ...menuStyle, padding: '0 7px', gap: 4 }}
          >
            <PlusIcon size={11} /> Add
          </Button>
        )
      }
    >
      {floor && (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>Shows</span>
            <select
              className="input"
              aria-label="What the floor shows"
              value={floor.mode}
              style={{ ...menuStyle, flex: 1 }}
              onChange={(e) => commit({ ...floor, mode: e.target.value as StageFloor['mode'] })}
            >
              <option value="shadow">Only the shadows</option>
              <option value="solid">A solid surface</option>
            </select>
          </div>
          {floor.mode === 'shadow' ? (
            <Slider
              label="Shadow"
              value={floor.shadow}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(shadow) => setFloor({ ...floor, shadow })}
            />
          ) : (
            <ColorField
              label="Color"
              value={floor.color}
              onChange={(color) => setFloor({ ...floor, color })}
            />
          )}
          <div style={rowStyle}>
            <span style={labelStyle}>Height</span>
            <NumberField
              value={floor.height}
              onChange={(height) => setFloor({ ...floor, height })}
            />
            <Button
              variant="ghost"
              title="Put it right under the lowest piece"
              onClick={() => commit({ ...floor, height: bounds().minY })}
              style={{ ...menuStyle, padding: '0 7px' }}
            >
              Under the pieces
            </Button>
          </div>
          {!shadowsOn && (
            <div className="text-muted" style={{ fontSize: 10, lineHeight: 1.5 }}>
              No light casts shadows yet: add a light and turn on <b>Casts shadows</b>.
            </div>
          )}
        </>
      )}
    </Block>
  )
}

export interface LightsPanelProps {
  project: Project
  stageId: string
  stage: Stage
  session: WorldSession | null
}

/** The lighting of the open animation: its lights (objects in the world,
 *  selectable like the camera), the environment and the floor. */
export function LightsPanel({ project, stageId, stage, session }: LightsPanelProps) {
  const worldSelId = useStore((s) => s.worldSelId)
  const addLight = useStore((s) => s.addLight)
  const applyLightPreset = useStore((s) => s.applyLightPreset)
  const clearLights = useStore((s) => s.clearLights)
  const importLights = useStore((s) => s.importLights)
  const [importing, setImporting] = useState(false)
  const bounds = () => session?.sceneBounds() ?? DEFAULT_BOUNDS
  const sources = lightSources(project, stageId)
  const selected = lightForKey(stage, worldSelId)

  return (
    <div
      style={{
        flex: 'none',
        maxHeight: '58%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        paddingTop: 'var(--space-2)',
        borderTop: '1px solid var(--color-neutral-800)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <LightIcon size={12} style={{ color: 'var(--color-neutral-400)' }} />
        <span className="tl-section-title" style={{ flex: 1 }}>
          Lights
        </span>
        <select
          className="input"
          aria-label="Add a light"
          title="Add a light around the pieces"
          value=""
          style={{ ...menuStyle, width: 62 }}
          onChange={(e) => {
            if (e.target.value) addLight(e.target.value as LightKind, bounds())
          }}
        >
          <option value="">+ Add</option>
          {LIGHT_KINDS.map((kind) => (
            <option key={kind} value={kind} title={LIGHT_KIND_HINT[kind]}>
              {LIGHT_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Light presets"
          title="Replace the lights with a ready-made set"
          value=""
          style={{ ...menuStyle, width: 70 }}
          onChange={(e) => {
            if (e.target.value === 'default') clearLights()
            else if (e.target.value) applyLightPreset(e.target.value as LightPreset, bounds())
          }}
        >
          <option value="">Presets</option>
          {LIGHT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {LIGHT_PRESET_LABEL[preset]}
            </option>
          ))}
          {stage.lights.length > 0 && <option value="default">Default — remove my lights</option>}
        </select>
        {sources.length > 0 && (
          <IconButton
            title="Import the lighting of an animation earlier in the chain"
            aria-label="Import lighting from an earlier animation"
            onClick={() => setImporting(true)}
          >
            <ImportIcon size={13} />
          </IconButton>
        )}
      </div>
      {importing && (
        <ImportLightsDialog
          sources={sources}
          hasLights={stage.lights.length > 0}
          onClose={() => setImporting(false)}
        />
      )}

      {stage.lights.length === 0 && (
        <div className="text-muted" style={{ fontSize: 10, lineHeight: 1.5 }}>
          No lights of its own: lit the default way. Add a light or pick a preset
          {sources.length > 0 && (
            <>
              , or{' '}
              <button
                className="link-button"
                onClick={() => importLights(sources[0].stageId, 'replace')}
              >
                light it like {sources[0].stageName}
              </button>
            </>
          )}
          .
        </div>
      )}
      {stage.lights.map((light) => (
        <LightRow key={light.id} stage={stage} light={light} />
      ))}
      {selected && <LightProps stage={stage} light={selected} session={session} />}

      <EnvironmentBlock stage={stage} />
      <FloorBlock stage={stage} session={session} />
    </div>
  )
}
