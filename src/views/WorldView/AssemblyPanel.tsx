import { LockIcon, LockOpenIcon, RestoreIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { isFreePart } from '@/lib/assembly'
import { assemblyParts, membersOf, PART_SEP, type AssemblyPart } from '@/lib/graph'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'
import { KeypointEditor } from './KeypointEditor'
import { MemberRow } from './MemberRow'

export interface AssemblyPanelProps {
  project: Project
  stageId: string
  stage: Stage
}

/** One piece of an assembly input, under its row: its own lock (released
 *  from the assembly / locked into it) and a way back to how it was
 *  assembled. A released piece is an object of its own, so it selects. */
function PieceRow({ stage, part }: { stage: Stage; part: AssemblyPart }) {
  const selected = useStore((s) => s.worldSelId === part.key)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const togglePartLock = useStore((s) => s.togglePartLock)
  const restorePart = useStore((s) => s.restorePart)
  const free = isFreePart(stage, part.key)
  const changed = !!stage.partOverrides[part.key]
  const name = part.mesh?.name ?? part.node.label ?? part.node.kind

  return (
    <div
      className={
        'outline-row' +
        (free ? '' : ' outline-row--static') +
        (selected ? ' outline-row--selected' : '')
      }
      title={name}
      onClick={(e) => {
        if (free && !(e.target as HTMLElement).closest('button')) selectWorldObject(part.key)
      }}
      style={{ marginLeft: 22 }}
    >
      <IconButton
        title={
          free
            ? 'Released — lock it back into the assembly where it is now'
            : 'Locked to the assembly — release it to move it on its own'
        }
        aria-pressed={free}
        active={free}
        onClick={() => togglePartLock(part.key)}
      >
        {free ? <LockOpenIcon size={13} /> : <LockIcon size={13} />}
      </IconButton>
      <span
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--color-accent-300)',
        }}
      >
        {part.mesh ? part.mesh.ext.toUpperCase() : 'ASM'}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>
      <IconButton
        title="Restore — put it back as it was assembled"
        disabled={!changed}
        style={{ opacity: changed ? 1 : 0.3 }}
        onClick={() => restorePart(part.key)}
      >
        <RestoreIcon size={13} />
      </IconButton>
    </div>
  )
}

export function AssemblyPanel({ project, stageId, stage }: AssemblyPanelProps) {
  const removeMember = useStore((s) => s.removeMember)
  const worldSelId = useStore((s) => s.worldSelId)
  const selectWorldObject = useStore((s) => s.selectWorldObject)
  const asmOpen = useStore((s) => s.asmOpen)
  const toggleAsmOpen = useStore((s) => s.toggleAsmOpen)
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
          const id = row.node.id
          const member = stage.members.find((m) => m.nodeId === id)
          if (!member) return null
          const isAsm = !row.mesh
          // pieces taken out of the assembly stay listed even with the
          // lock closed — they are no longer inside it
          const pieces = isAsm ? assemblyParts(project, id).filter((p) => p.depth === 1) : []
          const altered = Object.keys(stage.partOverrides).some((k) => k.startsWith(id + PART_SEP))
          const open = asmOpen.includes(id)
          return (
            <div key={id}>
              <MemberRow
                member={member}
                input={row}
                draggable={false}
                selected={worldSelId === id}
                onSelect={() => selectWorldObject(id)}
                leading={
                  isAsm ? (
                    <IconButton
                      title={
                        open
                          ? 'Unlocked — its pieces are listed below. Click to lock'
                          : 'Locked — moves as one. Click to reach its pieces'
                      }
                      aria-expanded={open}
                      active={open}
                      onClick={() => toggleAsmOpen(id)}
                    >
                      {open ? <LockOpenIcon size={13} /> : <LockIcon size={13} />}
                    </IconButton>
                  ) : undefined
                }
                onKill={() => removeMember(id)}
              />
              {pieces
                .filter((part) => open || (altered && !!stage.partOverrides[part.key]))
                .map((part) => (
                  <PieceRow key={part.key} stage={stage} part={part} />
                ))}
            </div>
          )
        })}
      </div>
      <KeypointEditor project={project} stage={stage} />
    </>
  )
}
