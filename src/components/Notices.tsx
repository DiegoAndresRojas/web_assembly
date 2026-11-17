import { useEffect } from 'react'

import { useStore } from '@/store'
import type { Notice } from '@/store/types'
import { CloseIcon } from './icons'

/** How long a notice stays before it leaves on its own. */
const STAY_MS = { info: 5000, error: 12000 }

function NoticeItem({ notice }: { notice: Notice }) {
  const dismiss = useStore((s) => s.dismissNotice)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), STAY_MS[notice.kind])
    return () => clearTimeout(timer)
  }, [notice.id, notice.kind, dismiss])
  return (
    <div
      className={'notice notice-' + notice.kind}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
      <button
        className="notice-close"
        title="Dismiss"
        aria-label="Dismiss"
        onClick={() => dismiss(notice.id)}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  )
}

/** The notices on screen, over whatever view is open. */
export function Notices() {
  const notices = useStore((s) => s.notices)
  if (!notices.length) return null
  return (
    <div className="notices">
      {notices.map((n) => (
        <NoticeItem key={n.id} notice={n} />
      ))}
    </div>
  )
}
