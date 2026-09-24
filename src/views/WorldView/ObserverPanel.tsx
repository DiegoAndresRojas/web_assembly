import { EyeIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { useStore } from '@/store'

export function ObserverPanel() {
  const observableStages = useStore((s) => s.observableStages)
  const toggleObserve = useStore((s) => s.toggleObserve)
  const focusObserved = useStore((s) => s.selectWorldObject)

  const project = useStore((s) => s.projects.find((p) => p.id === s.pid) ?? null)
  const aid = useStore((s) => s.aid)
  const observing = (aid && project?.stages[aid]?.observing) || []
  // stages wired into this observer on the board are always shown
  const wired = new Set(
    project?.board.edges.filter((e) => e.to === aid).map((e) => e.from) ?? [],
  )

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
            title={wired.has(o.id) ? 'Connected on the board' : 'Show / hide'}
            active={wired.has(o.id) || observing.includes(o.id)}
            onClick={() => {
              if (!wired.has(o.id)) toggleObserve(o.id)
            }}
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
