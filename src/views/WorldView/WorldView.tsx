import { useCallback, useState } from 'react'

import { BackIcon } from '@/components/icons'
import { NameField } from '@/components/NameField'
import { useShortcuts } from '@/hooks/useShortcuts'
import { stageName } from '@/lib/cameras'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { TimelineDock } from '@/views/TimelineView/TimelineDock'
import { VideoExportDialog } from '@/views/TimelineView/VideoExportDialog'
import { AnimatePanel } from './AnimatePanel'
import { AssemblyPanel } from './AssemblyPanel'
import { CamDeleteDialog } from './CamDeleteDialog'
import { DownloadDialog } from './DownloadDialog'
import { GapDialog } from './GapDialog'
import { TrackDeleteDialog } from './TrackDeleteDialog'
import { WorldViewport } from './WorldViewport'

export function WorldView({ stageId }: { stageId: string }) {
  const [session, setSession] = useState<WorldSession | null>(null)
  const project = useStore((s) => s.projects.find((p) => p.id === s.pid))
  const node = project?.board.nodes.find((n) => n.id === stageId)
  const wmode = useStore((s) => s.wmode)
  const backToBoard = useStore((s) => s.backToBoard)
  const renameNode = useStore((s) => s.renameNode)

  const onSession = useCallback((s: WorldSession | null) => setSession(s), [])
  useShortcuts(session)

  if (!project || !node) return null
  const stage = project.stages[stageId]
  if (!stage) return null

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
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              fontSize: 11,
              marginTop: 'calc(-1 * var(--space-2))',
            }}
          >
            <span className="text-muted" style={{ flex: 'none' }}>
              {project.name} /
            </span>
            <NameField
              label={node.kind === 'animation' ? 'Animation name' : 'Assembly name'}
              value={stageName(node)}
              onRename={(name) => renameNode(stageId, name)}
              style={{ flex: 1, fontSize: 12 }}
            />
          </div>

          {wmode === 'animate' && (
            <AnimatePanel project={project} stageId={stageId} stage={stage} session={session} />
          )}
          {wmode === 'assembly' && (
            <AssemblyPanel project={project} stageId={stageId} stage={stage} />
          )}
        </aside>

        <WorldViewport stageId={stageId} onSession={onSession} />
      </div>

      {wmode === 'animate' && (
        <TimelineDock project={project} stageId={stageId} stage={stage} session={session} />
      )}

      <DownloadDialog session={session} />
      <VideoExportDialog session={session} />
      <GapDialog />
      <TrackDeleteDialog />
      <CamDeleteDialog />
    </div>
  )
}
