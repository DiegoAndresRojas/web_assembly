import { EyeIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { useStore } from '@/store'

export function ObserverPanel() {
  const observableStages = useStore((s) => s.observableStages)
  const toggleObserve = useStore((s) => s.toggleObserve)
  const focusObserved = useStore((s) => s.selectWorldObject)

  const stage = useStore((s) => {
    const project = s.projects.find((p) => p.id === s.pid)
    return s.aid && project ? project.stages[s.aid] : undefined
  })
  const observing = stage?.observing ?? []

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      {observableStages().map((o) => (
        <div
          key={o.id}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '2px 0' }}
        >
          <IconButton
            title="Show / hide"
            active={observing.includes(o.id)}
            onClick={() => toggleObserve(o.id)}
          >
            <EyeIcon size={15} />
          </IconButton>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, justifyContent: 'flex-start', fontSize: 12 }}
            onClick={() => focusObserved(o.id)}
          >
            {o.label}
          </button>
        </div>
      ))}
    </div>
  )
}
