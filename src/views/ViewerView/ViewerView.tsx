import { useEffect, useState } from 'react'

import { Button } from '@/components/Button'
import {
  BackIcon,
  CameraTrackIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
} from '@/components/icons'
import { useWorldSession } from '@/hooks/useWorldSession'
import { placeIn, sequenceOf } from '@/lib/steps'
import { stageDuration } from '@/lib/timeline'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'

/** How far the step's animation has played — its own component, so only
 *  this bar is redrawn on every frame of playback. */
function Progress({ duration }: { duration: number }) {
  const playT = useStore((s) => s.playT)
  const done = duration > 0 ? Math.min(1, playT / duration) : 1
  return (
    <div className="viewer-progress" role="progressbar" aria-valuenow={Math.round(done * 100)}>
      <div style={{ width: done * 100 + '%' }} />
    </div>
  )
}

/** The assembly as someone follows it: one step at a time, played in the
 *  3D world, with its title and instructions. Nothing here edits the
 *  project. */
export function ViewerView({ stageId }: { stageId: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const project = useStore(selectCurrentProject)
  const playing = useStore((s) => s.playing)
  const cameraView = useStore((s) => s.cameraView)
  const hint = useStore((s) => s.hint)
  const setCameraView = useStore((s) => s.setCameraView)
  const viewStep = useStore((s) => s.viewStep)
  const closeViewer = useStore((s) => s.closeViewer)
  const onAnimPlay = useStore((s) => s.onAnimPlay)
  const seekTo = useStore((s) => s.seekTo)
  const session = useWorldSession(container, stageId)

  const steps = project ? sequenceOf(project) : []
  const place = placeIn(steps, stageId)
  const stage = project?.stages[stageId]
  const duration = stage?.kind === 'animation' ? stageDuration(stage) : 0
  const ended = useStore((s) => !s.playing && duration > 0 && s.playT >= duration)
  const hasCamera = !!stage?.tracks.some((t) => t.targetKind === 'camera')
  const prevId = place?.prev?.stageId ?? null
  const nextId = place?.next?.stageId ?? null

  useEffect(() => {
    const replay = () => {
      seekTo(0)
      onAnimPlay()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowRight' && nextId) viewStep(nextId)
      else if (e.key === 'ArrowLeft' && prevId) viewStep(prevId)
      else if (e.key === ' ') onAnimPlay()
      else if (e.key.toLowerCase() === 'r') replay()
      else if (e.key === 'Escape') closeViewer()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevId, nextId, viewStep, onAnimPlay, seekTo, closeViewer])

  if (!project || !place) return null

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <aside className="viewer-steps">
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="tool-btn" title="Close (Esc)" aria-label="Close" onClick={closeViewer}>
            <BackIcon size={15} />
          </button>
          <strong
            title={project.name}
            style={{
              minWidth: 0,
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project.name}
          </strong>
        </div>
        <ol>
          {steps.map((step, i) => (
            <li key={step.id}>
              <button
                className={'viewer-step' + (step.stageId === stageId ? ' viewer-step--on' : '')}
                aria-current={step.stageId === stageId ? 'step' : undefined}
                onClick={() => viewStep(step.stageId)}
              >
                <span className="viewer-step-n">{i + 1}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {step.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div ref={setContainer} style={{ position: 'absolute', inset: 0 }} />

        <div
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            display: 'flex',
            gap: 'var(--space-2)',
          }}
        >
          {hasCamera && (
            <Button
              variant="secondary"
              className={cameraView ? 'btn--on' : ''}
              title={
                cameraView
                  ? 'Showing the shot the author chose — click to look around freely'
                  : 'Look through the camera the author placed'
              }
              onClick={() => setCameraView(!cameraView)}
            >
              <CameraTrackIcon size={13} /> {cameraView ? 'Author’s view' : 'Free view'}
            </Button>
          )}
          {!(hasCamera && cameraView) && (
            <Button
              variant="secondary"
              title="Fit everything in view"
              onClick={() => session?.frameAll()}
            >
              Frame all
            </Button>
          )}
        </div>

        <section className="viewer-card" aria-live="polite">
          {duration > 0 && <Progress duration={duration} />}
          <div className="text-muted" style={{ fontSize: 11 }}>
            Step {place.number} of {place.total}
            {hint ? ` · ${hint}` : ''}
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: 17 }}>{place.step.title}</h2>
          {place.step.instructions && (
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {place.step.instructions}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <Button
              variant="secondary"
              disabled={!prevId}
              title="Previous step (←)"
              onClick={() => prevId && viewStep(prevId)}
            >
              <ChevronRightIcon size={11} style={{ transform: 'rotate(180deg)' }} /> Previous
            </Button>
            {duration > 0 && (
              <Button
                variant="secondary"
                title={playing ? 'Pause (Space)' : ended ? 'Play again (R)' : 'Play (Space)'}
                onClick={onAnimPlay}
              >
                {playing ? (
                  <PauseIcon size={12} />
                ) : ended ? (
                  <SkipBackIcon size={12} />
                ) : (
                  <PlayIcon size={12} />
                )}
                {playing ? 'Pause' : ended ? 'Replay' : 'Play'}
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button
              variant="primary"
              disabled={!nextId}
              title={nextId ? 'Next step (→)' : 'This is the last step'}
              onClick={() => nextId && viewStep(nextId)}
            >
              {nextId ? 'Next' : 'Done'} <ChevronRightIcon size={11} />
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
