import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useStore } from '@/store'

export function DeleteProjectDialog() {
  const confirm = useStore((s) => s.confirm)
  const cancel = useStore((s) => s.cancelDeleteConfirm)
  const confirmDelete = useStore((s) => s.confirmDelete)
  const open = confirm?.kind === 'project'

  return (
    <Dialog
      open={open}
      title="Delete project"
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
        ? `${confirm.label} will be removed with everything in it. This cannot be undone — export it first if you may want it back.`
        : null}
    </Dialog>
  )
}
