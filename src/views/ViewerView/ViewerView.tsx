import { useEffect, useState } from 'react'

import {
  BackIcon,
  CameraTrackIcon,
  MoveIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RestoreIcon,
  RotateIcon,
  SkipBackIcon,
  SkipNextIcon,
} from '@/components/icons'
import {
  lookAroundFromCamera,
  resetViewerOrbit,
  restoreViewerScene,
  useWorldSession,
} from '@/hooks/useWorldSession'
import { playlistOf, type Scene } from '@/lib/frames'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'

/** 0:07.4 — minutes, seconds and tenths. */
function clock(seconds: number): string {
  const s = Math.max(0, seconds)
  const whole = Math.floor(s)
  const tenth = Math.floor((s - whole) * 10)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${tenth}`
}

/** One animation on the top bar. Its own component — and the one playing
 *  the only one that reads the playhead — so a frame of playback redraws a
 *  single bar. */
function SceneTab({
  scene,
  number,
  state,
  weight,
  onOpen,
}: {
  scene: Scene
  number: number
  state: 'done' | 'on' | 'ahead'
  weight: number
  onOpen: () => void
}) {
  const playT = useStore((s) => (state === 'on' ? s.playT : 0))
  const filled =
    state === 'done'
      ? 1
      : state === 'ahead'
        ? 0
        : scene.duration > 0
          ? Math.min(1, playT / scene.duration)
          : 1
  return (
    <button
      className={'viewer-scene' + (state === 'on' ? ' viewer-scene--on' : '')}
      style={{ flex: `${weight} 1 0` }}
      title={`${number}. ${scene.title}`}
      aria-current={state === 'on' ? 'step' : undefined}
      onClick={onOpen}
    >
      <div className="viewer-scene-bar">
        <div style={{ width: filled * 100 + '%' }} />
      </div>
      <span className="viewer-scene-name">
        {number}. {scene.title}
      </span>
    </button>
  )
}

/** The second the open animation is on, to drag along it. */
function Seek({ duration }: { duration: number }) {
  const playT = useStore((s) => s.playT)
  const seekTo = useStore((s) => s.seekTo)
  const t = Math.min(playT, duration)
  return (
    <div className="viewer-seek">
      <span>{clock(t)}</span>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={t}
        disabled={duration <= 0}
        aria-label="Second of this animation"
        onChange={(e) => seekTo(Number(e.target.value))}
      />
      <span className="text-muted">{clock(duration)}</span>
    </div>
  )
}

/** A presentation, played: its animations along a bar at the top, the
 *  open one in the 3D world, and a player's controls at the bottom. The
 *  pieces can be picked and moved to look at them — nothing done here
 *  changes the project. */
export function ViewerView({ stageId }: { stageId: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const project = useStore(selectCurrentProject)
  const frameId = useStore((s) => s.viewerFrame)
  const playing = useStore((s) => s.playing)
  const cameraView = useStore((s) => s.cameraView)
  const selected = useStore((s) => s.worldSelId)
  const gizmoMode = useStore((s) => s.gizmoMode)
  const hint = useStore((s) => s.hint)
  const setCameraView = useStore((s) => s.setCameraView)
  const setGizmoMode = useStore((s) => s.setGizmoMode)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const viewScene = useStore((s) => s.viewScene)
  const closeViewer = useStore((s) => s.closeViewer)
  const onAnimPlay = useStore((s) => s.onAnimPlay)
  // (before the 3D world is made: the first animation is seen from the
  // default view)
  useEffect(() => resetViewerOrbit(), [])
  const session = useWorldSession(container, stageId)
  // one animation after another by itself, or each one waiting to be asked
  const [auto, setAuto] = useState(true)

  const { frame, scenes } = project ? playlistOf(project, frameId) : { frame: null, scenes: [] }
  const index = scenes.findIndex((s) => s.stageId === stageId)
  const scene = scenes[index] as Scene | undefined
  const duration = scene?.duration ?? 0
  const prevId = scenes[index - 1]?.stageId ?? null
  const nextId = scenes[index + 1]?.stageId ?? null
  const firstId = scenes[0]?.stageId ?? null
  const ended = useStore((s) => !s.playing && s.playT >= duration)
  const hasCamera = !!project?.stages[stageId]?.tracks.some((t) => t.targetKind === 'camera')
  const through = hasCamera && cameraView

  // like a video: an animation that plays to its end is followed by the next
  useEffect(() => {
    if (!nextId || !auto) return
    return useStore.subscribe((s, prev) => {
      if (prev.playing && !s.playing && s.aid === stageId && s.playT >= duration) viewScene(nextId)
    })
  }, [stageId, nextId, duration, viewScene, auto])

  /** Play / pause; at the very end, the whole presentation again. */
  const play = () => {
    if (!playing) {
      // pieces moved by hand go back as it plays: let go of them
      selectWorldObject(null)
      if (ended && !nextId && firstId && firstId !== stageId) {
        viewScene(firstId)
        return
      }
    }
    onAnimPlay()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const state = useStore.getState()
      if (e.key === 'ArrowRight' && nextId) viewScene(nextId)
      else if (e.key === 'ArrowLeft' && prevId) viewScene(prevId)
      else if (e.key === ' ') onAnimPlay()
      else if (e.key.toLowerCase() === 'r') restoreViewerScene()
      else if (e.key === 'Escape') {
        if (state.worldSelId) selectWorldObject(null)
        else closeViewer()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevId, nextId, viewScene, onAnimPlay, closeViewer, selectWorldObject])

  if (!project || !scene) return null

  return (
    <div className="viewer">
      <div
        ref={setContainer}
        className="viewer-stage"
        // taking hold of the world lets go of the author's camera: it can
        // be turned, and its pieces picked, from where that camera was
        onPointerDownCapture={() => {
          if (through) lookAroundFromCamera()
        }}
      />

      <header className="viewer-top">
        <div className="viewer-title">
          <button
            className="viewer-btn"
            title="Close (Esc)"
            aria-label="Close"
            onClick={closeViewer}
          >
            <BackIcon size={15} />
          </button>
          <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {frame ? frame.label : project.name}
          </strong>
          <span className="text-muted" style={{ flex: 'none' }}>
            {frame ? `${project.name} · ` : ''}
            {index + 1} of {scenes.length}
            {hint ? ` · ${hint}` : ''}
          </span>
        </div>
        <nav className="viewer-scenes" aria-label="Animations of this presentation">
          {scenes.map((s, i) => (
            <SceneTab
              key={s.stageId}
              scene={s}
              number={i + 1}
              state={i < index ? 'done' : i === index ? 'on' : 'ahead'}
              // as wide as it is long — one with nothing to play still shows
              weight={Math.max(s.duration, 1)}
              onOpen={() => viewScene(s.stageId)}
            />
          ))}
        </nav>
      </header>

      <footer className="viewer-bottom">
        <Seek duration={duration} />
        <div className="viewer-controls">
          <button
            className="viewer-btn"
            title="Previous animation (←)"
            aria-label="Previous animation"
            disabled={!prevId}
            onClick={() => prevId && viewScene(prevId)}
          >
            <SkipBackIcon size={16} />
          </button>
          <button
            className="viewer-btn viewer-btn--main"
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={duration <= 0 && !(ended && !nextId && firstId !== stageId)}
            onClick={play}
          >
            {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          <button
            className="viewer-btn"
            title="Next animation (→)"
            aria-label="Next animation"
            disabled={!nextId}
            onClick={() => nextId && viewScene(nextId)}
          >
            <SkipNextIcon size={16} />
          </button>
          <button
            className="viewer-btn"
            title="Put every piece back where this animation has it at this second (R)"
            onClick={restoreViewerScene}
          >
            <RestoreIcon size={16} /> Reset
          </button>

          <button
            className={'viewer-btn' + (auto ? ' viewer-btn--on' : '')}
            title={
              auto
                ? 'Each animation is followed by the next — click to stop after each one'
                : 'Stops after each animation — click to play one after another'
            }
            aria-pressed={auto}
            onClick={() => setAuto(!auto)}
          >
            <RepeatIcon size={15} /> Auto-advance
          </button>

          <span style={{ flex: 1 }} />

          {selected ? (
            <>
              <button
                className={'viewer-btn' + (gizmoMode === 'translate' ? ' viewer-btn--on' : '')}
                title="Move the piece you picked"
                onClick={() => setGizmoMode('translate')}
              >
                <MoveIcon size={15} /> Move
              </button>
              <button
                className={'viewer-btn' + (gizmoMode === 'rotate' ? ' viewer-btn--on' : '')}
                title="Turn the piece you picked"
                onClick={() => setGizmoMode('rotate')}
              >
                <RotateIcon size={15} /> Turn
              </button>
            </>
          ) : (
            <span className="text-muted" style={{ fontSize: 11 }}>
              {through ? 'Drag to look around' : 'Click a piece to move it'}
            </span>
          )}
          {hasCamera && (
            <button
              className={'viewer-btn' + (through ? ' viewer-btn--on' : '')}
              title={
                through
                  ? 'Showing the shots the author chose — click to move the camera yourself'
                  : 'You move the camera — click to see the shots the author chose'
              }
              aria-pressed={through}
              onClick={() => (through ? lookAroundFromCamera() : setCameraView(true))}
            >
              <CameraTrackIcon size={14} /> Author’s view
            </button>
          )}
          {!through && (
            <button
              className="viewer-btn"
              title="Fit everything in view"
              onClick={() => session?.frameAll()}
            >
              Frame all
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
