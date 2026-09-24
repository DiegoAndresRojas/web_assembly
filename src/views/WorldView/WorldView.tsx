import { useCallback, useState } from 'react'

import { Button } from '@/components/Button'
import { BackIcon } from '@/components/icons'
import { firstAnimatedObserved } from '@/hooks/useWorldSession'
import { formatClock, stageDuration } from '@/lib/timeline'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { TimelineDock } from '@/views/TimelineView/TimelineDock'
import { VideoExportDialog } from '@/views/TimelineView/VideoExportDialog'
import { AnimatePanel } from './AnimatePanel'
import { AssemblyPanel } from './AssemblyPanel'
import { CamDeleteDialog } from './CamDeleteDialog'
import { DownloadDialog } from './DownloadDialog'
import { GapDialog } from './GapDialog'
import { ObserverPanel } from './ObserverPanel'
import { TrackDeleteDialog } from './TrackDeleteDialog'
import { WorldViewport } from './WorldViewport'

export function WorldView({ stageId }: { stageId: string }) {
  const [session, setSession] = useState<WorldSession | null>(null)
  const project = useStore((s) => s.projects.find((p) => p.id === s.pid))
  const node = project?.board.nodes.find((n) => n.id === stageId)
  const wmode = useStore((s) => s.wmode)
  const playing = useStore((s) => s.playing)
  const playT = useStore((s) => s.playT)
  const onObsPlay = useStore((s) => s.onObsPlay)
  const onObsReset = useStore((s) => s.onObsReset)
  const backToBoard = useStore((s) => s.backToBoard)

  const onSession = useCallback((s: WorldSession | null) => setSession(s), [])

  if (!project || !node) return null
  const stage = project.stages[stageId]
  if (!stage) return null

  const observedTarget = wmode === 'observer' ? firstAnimatedObserved(project, stageId) : null
  const observedAnim = !!observedTarget
  const observedDur = observedTarget ? stageDuration(observedTarget.stage) : 0

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside
          style={{
            width: 286,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            padding: 'var(--space-4)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'auto',
          }}
        >
          <button
            className="btn btn-ghost"
            style={{ flex: 'none', alignSelf: 'flex-start' }}
            onClick={backToBoard}
          >
            <BackIcon size={15} /> Back to board
          </button>
          <div
            className="text-muted"
            style={{ flex: 'none', fontSize: 11, marginTop: 'calc(-1 * var(--space-2))' }}
          >
            {project.name} / {node.label ?? node.kind}
          </div>

          {observedAnim && (
            <>
              <div
                style={{
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <Button variant="primary" style={{ flex: 1, fontSize: 11 }} onClick={onObsPlay}>
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <Button variant="secondary" style={{ fontSize: 11 }} onClick={onObsReset}>
                  Reset
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
                {formatClock(playT)} / {formatClock(observedDur)}
              </div>
            </>
          )}

          {wmode === 'animate' && (
            <AnimatePanel project={project} stageId={stageId} stage={stage} session={session} />
          )}
          {wmode === 'assembly' && (
            <AssemblyPanel project={project} stageId={stageId} stage={stage} />
          )}
          {wmode === 'observer' && <ObserverPanel />}
        </aside>

        <WorldViewport stageId={stageId} onSession={onSession} />
      </div>

      {wmode === 'animate' && <TimelineDock project={project} stage={stage} session={session} />}

      <DownloadDialog session={session} />
      <VideoExportDialog session={session} />
      <GapDialog />
      <TrackDeleteDialog />
      <CamDeleteDialog />
    </div>
  )
}
