import type { ReactNode } from 'react'

import { Button } from '@/components/Button'
import {
  CameraTrackIcon,
  DownloadIcon,
  MagnetIcon,
  PauseIcon,
  PlayIcon,
  RecordIcon,
  RepeatIcon,
  SkipBackIcon,
} from '@/components/icons'
import { recordFromViewport } from '@/hooks/useShortcuts'
import { formatClock, stageDuration } from '@/lib/timeline'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { ZOOM_RANGE } from '@/store/animationSlice'
import type { Stage } from '@/types/project'
import { NumberField } from './NumberField'

function Toggle({
  on,
  title,
  onClick,
  children,
}: {
  on: boolean
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      className={on ? 'btn--on' : ''}
      title={title}
      aria-pressed={on}
      onClick={onClick}
      style={{ fontSize: 11, padding: '4px 8px', gap: 5 }}
    >
      {children}
    </Button>
  )
}

/** Playback and timeline controls above the tracks. */
export function TransportBar({ stage, session }: { stage: Stage; session: WorldSession | null }) {
  const playing = useStore((s) => s.playing)
  const playT = useStore((s) => s.playT)
  const loop = useStore((s) => s.loop)
  const snap = useStore((s) => s.snap)
  const cameraView = useStore((s) => s.cameraView)
  const pxPerSecond = useStore((s) => s.pxPerSecond)
  const canRecord = useStore(
    (s) =>
      !!s.worldSelId ||
      stage.tracks.some((t) => t.targetKind === 'camera' && t.id === s.selection?.trackId),
  )
  const onAnimPlay = useStore((s) => s.onAnimPlay)
  const seekTo = useStore((s) => s.seekTo)
  const setLoop = useStore((s) => s.setLoop)
  const setSnap = useStore((s) => s.setSnap)
  const setCameraView = useStore((s) => s.setCameraView)
  const setZoom = useStore((s) => s.setZoom)
  const openVideoAsk = useStore((s) => s.openVideoAsk)

  const dur = stageDuration(stage)
  const hasCam = stage.tracks.some((t) => t.targetKind === 'camera')

  return (
    <div className="tl-transport">
      <Button
        variant="ghost"
        title="Go to start (Home)"
        onClick={() => seekTo(0)}
        style={{ padding: 6 }}
      >
        <SkipBackIcon size={14} />
      </Button>
      <Button
        variant="primary"
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        disabled={dur <= 0}
        onClick={onAnimPlay}
        className={playing ? 'btn--live' : ''}
        style={{ padding: '5px 12px' }}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </Button>
      <NumberField
        value={playT}
        step={0.1}
        width={62}
        undoable={false}
        onChange={(v) => seekTo(v)}
      />
      <span className="text-muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
        / {formatClock(dur)}
      </span>

      <div className="tl-sep" />
      <Toggle on={loop} title="Loop playback" onClick={() => setLoop(!loop)}>
        <RepeatIcon size={13} /> Loop
      </Toggle>
      <Toggle
        on={snap}
        title="Snap to 0.1 s, the playhead and other actions"
        onClick={() => setSnap(!snap)}
      >
        <MagnetIcon size={13} /> Snap
      </Toggle>
      {hasCam && (
        <Toggle
          on={cameraView}
          title={cameraView ? 'Back to your own view' : 'Look through the animation camera'}
          onClick={() => setCameraView(!cameraView)}
        >
          <CameraTrackIcon size={13} /> {cameraView ? 'Viewing camera' : 'Look through'}
        </Toggle>
      )}

      <div className="tl-sep" />
      <Button
        variant="secondary"
        disabled={!canRecord}
        title="Record the selected piece's viewport pose (or the current view, for the camera track) as the end of an action at the playhead (K)"
        onClick={() => recordFromViewport(session)}
        style={{ fontSize: 11, padding: '4px 10px', gap: 6 }}
      >
        <RecordIcon size={12} style={{ color: '#e06a6a' }} /> Record pose
        <span className="text-muted" style={{ fontSize: 10 }}>
          K
        </span>
      </Button>

      <div style={{ flex: 1 }} />
      <Button
        variant="ghost"
        title="Zoom out"
        onClick={() => setZoom(pxPerSecond / 1.25)}
        style={{ padding: '2px 8px' }}
      >
        −
      </Button>
      <input
        type="range"
        title="Timeline zoom (Ctrl + wheel)"
        min={Math.log(ZOOM_RANGE.min)}
        max={Math.log(ZOOM_RANGE.max)}
        step={0.01}
        value={Math.log(pxPerSecond)}
        onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
        style={{ width: 96, accentColor: 'var(--color-accent)' }}
      />
      <Button
        variant="ghost"
        title="Zoom in"
        onClick={() => setZoom(pxPerSecond * 1.25)}
        style={{ padding: '2px 8px' }}
      >
        +
      </Button>
      <div className="tl-sep" />
      <Button
        variant="ghost"
        title="Export the animation as video"
        disabled={dur <= 0}
        onClick={openVideoAsk}
        style={{ fontSize: 11, padding: '4px 8px', gap: 5 }}
      >
        <DownloadIcon size={13} /> Export
      </Button>
    </div>
  )
}
