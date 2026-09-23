import { membersOf } from '@/lib/graph'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'
import { KeypointEditor } from './KeypointEditor'
import { MemberRow } from './MemberRow'

export interface AssemblyPanelProps {
  project: Project
  stageId: string
  stage: Stage
}

export function AssemblyPanel({ project, stageId, stage }: AssemblyPanelProps) {
  const removeMember = useStore((s) => s.removeMember)
  const rows = membersOf(project, stageId)

  return (
    <>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginTop: 'var(--space-2)',
        }}
      >
        {rows.map((row) => {
          const member = stage.members.find((m) => m.nodeId === row.node.id)
          if (!member) return null
          return (
            <MemberRow
              key={row.node.id}
              member={member}
              mesh={row.mesh}
              onKill={() => removeMember(row.node.id)}
            />
          )
        })}
      </div>
      <KeypointEditor project={project} stage={stage} />
    </>
  )
}
