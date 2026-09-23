import { CloseIcon } from '@/components/icons'
import { nodeById } from '@/lib/graph'
import { useStore } from '@/store'
import type { BoardEdge, Project } from '@/types/project'

export interface EdgeLayerProps {
  project: Project
}

export function EdgeLayer({ project }: EdgeLayerProps) {
  const selEdge = useStore((s) => s.selEdge)
  const linking = useStore((s) => s.linking)
  const selectEdge = useStore((s) => s.selectEdge)
  const deleteSelectedEdge = useStore((s) => s.deleteSelectedEdge)

  const geometry = project.board.edges
    .map((e) => {
      const from = nodeById(project, e.from)
      const to = nodeById(project, e.to)
      if (!from || !to) return null
      return { edge: e, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
    })
    .filter((x): x is { edge: BoardEdge; x1: number; y1: number; x2: number; y2: number } => !!x)

  const selected = selEdge ? geometry.find((g) => g.edge.id === selEdge) : null
  const linkFrom = linking ? nodeById(project, linking.from) : null

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <marker
            id="ms-arrow"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={5}
            markerHeight={5}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#968ae0" />
          </marker>
        </defs>
        {geometry.map(({ edge, x1, y1, x2, y2 }) => (
          <g key={edge.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={selEdge === edge.id ? '#968ae0' : '#5a5670'}
              strokeWidth={1.5}
              markerEnd="url(#ms-arrow)"
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onPointerDown={(ev) => {
                ev.stopPropagation()
                selectEdge(edge.id)
              }}
            />
          </g>
        ))}
        {linking && linkFrom && (
          <line
            x1={linkFrom.x}
            y1={linkFrom.y}
            x2={linking.x}
            y2={linking.y}
            stroke="#b5abfc"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}
      </svg>

      {selected && (
        <div
          style={{
            position: 'absolute',
            left: (selected.x1 + selected.x2) / 2,
            top: (selected.y1 + selected.y2) / 2,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              onPointerDown={(ev) => {
                ev.stopPropagation()
                deleteSelectedEdge()
              }}
            >
              <CloseIcon size={10} /> Delete link
            </button>
          </div>
        </div>
      )}
    </>
  )
}
