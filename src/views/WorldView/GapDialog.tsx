import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { useStore } from '@/store'

export function GapDialog() {
  const gapPending = useStore((s) => s.gapPending)
  const rejectGap = useStore((s) => s.rejectGap)
  const acceptGap = useStore((s) => s.acceptGap)

  return (
    <Dialog
      open={!!gapPending}
      title={gapPending ? `Gap of ${gapPending.gap.toFixed(2)} units` : ''}
      actions={
        <>
          <Button variant="secondary" onClick={rejectGap}>
            Reject
          </Button>
          <Button variant="primary" onClick={acceptGap}>
            Accept
          </Button>
        </>
      }
    >
      The earlier constraint keeps these points apart. The piece was rotated so the point faces its
      target, but they do not touch.
    </Dialog>
  )
}
