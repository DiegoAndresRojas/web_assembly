import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useStore } from '@/store'

export function DeleteMeshDialog() {
  const confirm = useStore((s) => s.confirm)
  const cancel = useStore((s) => s.cancelDeleteConfirm)
  const confirmDelete = useStore((s) => s.confirmDelete)
  const open = confirm?.kind === 'mesh'

  return (
    <Dialog
      open={open}
      title="Delete mesh"
      onClose={cancel}
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </>
      }
    >
      {open
        ? `${confirm.label} will be removed from the project, along with the pieces on the board that use it. Ctrl+Z on the board brings it back.`
        : null}
    </Dialog>
  )
}
