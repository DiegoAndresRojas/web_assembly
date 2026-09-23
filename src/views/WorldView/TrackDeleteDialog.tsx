import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useStore } from '@/store'

export function TrackDeleteDialog() {
  const confirm = useStore((s) => s.confirm)
  const cancel = useStore((s) => s.cancelDeleteConfirm)
  const confirmRemoveTrack = useStore((s) => s.confirmRemoveTrack)
  const open = confirm?.kind === 'track'

  return (
    <Dialog
      open={open}
      title={open ? `Remove ${confirm.label}` : ''}
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmRemoveTrack}>
            Remove
          </Button>
        </>
      }
    >
      This piece has animation. Removing it also deletes its track and every action on it.
    </Dialog>
  )
}
