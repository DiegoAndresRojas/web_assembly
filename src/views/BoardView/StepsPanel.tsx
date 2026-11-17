import { useState } from 'react'

import { FoldHeader, useFold } from '@/components/Fold'
import { IconButton } from '@/components/IconButton'
import { ArrowUpIcon, ChevronRightIcon, CloseIcon } from '@/components/icons'
import { NameField } from '@/components/NameField'
import { stageName } from '@/lib/cameras'
import { stagesWithoutStep } from '@/lib/steps'
import { useStore } from '@/store'
import type { Project, Step } from '@/types/project'

const EVERY = '*'

function StepRow({
  project,
  step,
  number,
  selected,
  onSelect,
}: {
  project: Project
  step: Step
  number: number
  selected: boolean
  onSelect: () => void
}) {
  const updateStep = useStore((s) => s.updateStep)
  const moveStep = useStore((s) => s.moveStep)
  const removeStep = useStore((s) => s.removeStep)
  const openStage = useStore((s) => s.openStage)
  const stage = stageName(project.board.nodes.find((n) => n.id === step.stageId))
  const last = number === project.steps.length

  return (
    <>
      <div
        className={'outline-row' + (selected ? ' outline-row--selected' : '')}
        title={
          step.instructions ? `${stage} — ${step.instructions}` : `${stage} — no instructions yet`
        }
        onClick={onSelect}
      >
        <span
          className="text-muted"
          style={{ flex: 'none', width: 14, fontSize: 10, textAlign: 'right' }}
        >
          {number}
        </span>
        <span
          style={{ flex: 1, minWidth: 0, display: 'flex' }}
          onClick={(e) => e.stopPropagation()}
        >
          <NameField
            label="Step title"
            value={step.title}
            onRename={(title) => updateStep(step.id, { title })}
            style={{ flex: 1, fontSize: 12 }}
          />
        </span>
        <span style={{ flex: 'none', display: 'flex' }} onClick={(e) => e.stopPropagation()}>
          <IconButton
            title="Earlier"
            aria-label="Move the step earlier"
            disabled={number === 1}
            onClick={() => moveStep(step.id, -1)}
          >
            <ArrowUpIcon size={10} />
          </IconButton>
          <IconButton
            title="Later"
            aria-label="Move the step later"
            disabled={last}
            onClick={() => moveStep(step.id, 1)}
          >
            <ArrowUpIcon size={10} style={{ transform: 'rotate(180deg)' }} />
          </IconButton>
          <IconButton
            title={`Open ${stage}`}
            aria-label={`Open ${stage}`}
            onClick={() => openStage(step.stageId)}
          >
            <ChevronRightIcon size={11} />
          </IconButton>
          <IconButton
            title="Take out of the steps (the stage stays on the board)"
            aria-label="Remove the step"
            onClick={() => removeStep(step.id)}
          >
            <CloseIcon size={10} />
          </IconButton>
        </span>
      </div>
      {selected && (
        <textarea
          // (a field of its own per step: what is typed is kept on leaving it)
          key={step.id + step.instructions}
          className="input"
          aria-label="Step instructions"
          placeholder="What to do in this step"
          defaultValue={step.instructions}
          rows={3}
          onBlur={(e) => updateStep(step.id, { instructions: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ flex: 'none', fontSize: 12, lineHeight: 1.4, resize: 'vertical' }}
        />
      )}
    </>
  )
}

/** The assembly sequence: the stages someone is taken through, in order,
 *  each with its title and instructions. */
export function StepsPanel({ project }: { project: Project }) {
  const addStep = useStore((s) => s.addStep)
  const addEveryStep = useStore((s) => s.addEveryStep)
  const [open, toggle] = useFold('board.steps')
  const [selected, setSelected] = useState<string | null>(null)
  const free = stagesWithoutStep(project)

  return (
    <div
      style={{
        flex: 'none',
        minHeight: 0,
        maxHeight: '45%',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <FoldHeader title="Steps" note={project.steps.length || ''} open={open} onToggle={toggle}>
        {free.length > 0 && (
          <select
            className="input"
            value=""
            title="Add a stage to the steps"
            aria-label="Add a stage to the steps"
            style={{ height: 22, minHeight: 22, padding: '0 4px', fontSize: 10, width: 38 }}
            onChange={(e) => {
              if (e.target.value === EVERY) addEveryStep()
              else if (e.target.value) addStep(e.target.value)
            }}
          >
            <option value="">+</option>
            {free.map((node) => (
              <option key={node.id} value={node.id}>
                {stageName(node)}
              </option>
            ))}
            {free.length > 1 && <option value={EVERY}>All of them, in order</option>}
          </select>
        )}
      </FoldHeader>
      {open && (
        <div
          style={{
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {project.steps.length === 0 && (
            <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45 }}>
              {free.length
                ? 'The order the assembly is followed in. Add stages with +.'
                : 'The order the assembly is followed in. Drop a stage on the board first.'}
            </div>
          )}
          {project.steps.map((step, i) => (
            <StepRow
              key={step.id}
              project={project}
              step={step}
              number={i + 1}
              selected={selected === step.id}
              onSelect={() => setSelected(selected === step.id ? null : step.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
