import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { stageName } from '@/lib/cameras'
import { useStore } from '@/store'
import type { Project } from '@/types/project'

/** What an animation tells whoever watches it — written from the board,
 *  without opening the animation. Saved as it is typed. */
export function NoteDialog({
  project,
  stageId,
  onClose,
}: {
  project: Project
  stageId: string | null
  onClose: () => void
}) {
  const setStageNote = useStore((s) => s.setStageNote)
  const node = project.board.nodes.find((n) => n.id === stageId)
  const stage = stageId ? project.stages[stageId] : undefined
  const open = !!node && !!stage

  return (
    <Dialog
      open={open}
      title={node ? `Text of ${stageName(node)}` : ''}
      onClose={onClose}
      actions={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {open && (
        <>
          <textarea
            className="input note-input"
            autoFocus
            rows={6}
            placeholder="What is happening here — e.g. “Push the gear onto the shaft until it clicks.”"
            aria-label="Text shown with this animation"
            value={stage.note}
            onChange={(e) => setStageNote(node.id, e.target.value)}
          />
          <p className="text-muted" style={{ margin: 'var(--space-2) 0 0', fontSize: 12 }}>
            Shown under the animation while it plays in a presentation.
          </p>
        </>
      )}
    </Dialog>
  )
}
