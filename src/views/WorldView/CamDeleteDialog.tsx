import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useStore } from '@/store'

export function CamDeleteDialog() {
  const confirm = useStore((s) => s.confirm)
  const cancel = useStore((s) => s.cancelCamDelete)
  const confirmCamDelete = useStore((s) => s.confirmCamDelete)
  const open = confirm?.kind === 'camera'

  return (
    <Dialog
      open={open}
      title="Delete the camera"
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmCamDelete}>
            Delete
          </Button>
        </>
      }
    >
      The camera has animation. Deleting it also removes its track and every action on it.
    </Dialog>
  )
}
