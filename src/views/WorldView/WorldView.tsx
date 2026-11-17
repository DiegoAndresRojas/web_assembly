import { useCallback, useState } from 'react'

import { BackIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
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
  const setStageNote = useStore((s) => s.setStageNote)

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
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'auto',
          }}
        >
          <div
            style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
          >
            <IconButton
              size="md"
              title="Back to board"
              aria-label="Back to board"
              onClick={backToBoard}
            >
              <BackIcon size={15} />
            </IconButton>
            <span
              className="text-muted"
              title={project.name}
              style={{
                flex: '0 1 auto',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
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
            <textarea
              className="input note-input"
              rows={3}
              style={{ flex: 'none' }}
              placeholder="Text shown with this animation in a presentation"
              aria-label="Text shown with this animation"
              title="What is happening here, for whoever watches the presentation"
              value={stage.note}
              // (its keys are its own: no shortcut of the stage reacts)
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => setStageNote(stageId, e.target.value)}
            />
          )}
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
