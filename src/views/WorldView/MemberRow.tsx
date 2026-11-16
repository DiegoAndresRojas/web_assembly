import type { ReactNode } from 'react'

import { EyeIcon, OpacityIcon, TrashIcon } from '@/components/icons'
import { IconButton } from '@/components/IconButton'
import { useStore } from '@/store'
import type { MembersRow, StageMember } from '@/types/project'

export interface MemberRowProps {
  member: StageMember
  input: MembersRow
  draggable?: boolean
  leading?: ReactNode
  onKill: () => void
  /** Selectable rows (the animate scene list) highlight and report clicks
   *  outside their buttons. */
  selected?: boolean
  onSelect?: () => void
}

/** One row in the assembly "Linked meshes" list or the animate scene list:
 *  eye/opacity/kill controls shared by both. An upstream assembly input
 *  shows as "ASM" with its stage label. */
export function MemberRow({
  member,
  input,
  draggable = true,
  leading,
  onKill,
  selected = false,
  onSelect,
}: MemberRowProps) {
  const name = input.mesh?.name ?? input.node.label ?? input.node.kind
  const tag = input.mesh ? input.mesh.ext.toUpperCase() : 'ASM'
  const opacityOpenId = useStore((s) => s.opacityOpenId)
  const toggleMemberVisible = useStore((s) => s.toggleMemberVisible)
  const toggleOpacityUI = useStore((s) => s.toggleOpacityUI)
  const setMemberOpacity = useStore((s) => s.setMemberOpacity)
  const opacityOpen = opacityOpenId === member.nodeId

  return (
    <div>
      <div
        className={onSelect ? 'outline-row' + (selected ? ' outline-row--selected' : '') : undefined}
        draggable={draggable}
        onDragStart={(e) => e.dataTransfer.setData('text/ms-node-id', member.nodeId)}
        onClick={(e) => {
          if (onSelect && !(e.target as HTMLElement).closest('button')) onSelect()
        }}
        title={name}
        style={{
          cursor: onSelect ? 'pointer' : 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: onSelect ? undefined : '2px 0',
          opacity: member.visible ? 1 : 0.5,
        }}
      >
        {leading}
        <div
          style={{
            width: 18,
            height: 18,
            flex: 'none',
            borderRadius: 2,
            backgroundImage:
              'repeating-linear-gradient(135deg, var(--color-neutral-800), var(--color-neutral-800) 3px, transparent 3px, transparent 6px)',
          }}
        />
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            color: 'var(--color-accent-300)',
          }}
        >
          {tag}
        </span>
        <span className="text-muted" style={{ fontSize: 10 }}>
          :
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
          title={member.visible ? 'Hide' : 'Show'}
          active={member.visible}
          onClick={() => toggleMemberVisible(member.nodeId)}
        >
          <EyeIcon size={13} />
        </IconButton>
        <IconButton
          title={`Opacity ${Math.round(member.opacity * 100)}%`}
          active={opacityOpen || member.opacity < 1}
          onClick={() => toggleOpacityUI(member.nodeId)}
        >
          <OpacityIcon size={13} />
        </IconButton>
        <IconButton title="Remove from world" onClick={onKill}>
          <TrashIcon size={13} />
        </IconButton>
      </div>
      {opacityOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '2px 0 6px 26px',
          }}
        >
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={member.opacity}
            onChange={(e) => setMemberOpacity(member.nodeId, Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-accent)' }}
          />
          <span
            className="text-muted"
            style={{
              fontSize: 10,
              fontFamily: 'ui-monospace, monospace',
              minWidth: 30,
              textAlign: 'right',
            }}
          >
            {Math.round(member.opacity * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
