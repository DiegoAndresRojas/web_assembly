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
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmDelete}>
            Delete
          </Button>
        </>
      }
    >
      {open ? `${confirm.label} and its board will be removed. This cannot be undone.` : null}
    </Dialog>
  )
}
