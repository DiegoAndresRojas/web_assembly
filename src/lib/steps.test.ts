import { describe, expect, it } from 'vitest'

import { normalizeProject } from './migrations'
import { addStep, moveStep, stagesWithoutStep, stepPlace } from './steps'
import type { Project } from '@/types/project'

/** piece → asm1 → asm2, an animation on each, and a loose assembly. */
function board(steps: unknown[] = []): Project {
  return normalizeProject({
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'anim2', kind: 'animation', label: 'Close the lid' },
        { id: 'asm2', kind: 'assembly', label: 'Box' },
        { id: 'piece', kind: 'mesh', meshId: 'file' },
        { id: 'anim1', kind: 'animation', label: 'Fit the gear' },
        { id: 'asm1', kind: 'assembly', label: 'Gear' },
      ],
      edges: [
        { from: 'piece', to: 'asm1' },
        { from: 'asm1', to: 'asm2' },
        { from: 'asm1', to: 'anim1' },
        { from: 'asm2', to: 'anim2' },
      ],
    },
    steps,
  })!
}

describe('the sequence of steps', () => {
  it('offers the stages that are not steps yet in the order the chain builds them', () => {
    const project = board()
    expect(stagesWithoutStep(project).map((n) => n.id)).toEqual(['asm1', 'anim1', 'asm2', 'anim2'])
    addStep(project, 'anim1')
    expect(stagesWithoutStep(project).map((n) => n.id)).toEqual(['asm1', 'asm2', 'anim2'])
  })

  it('adds a stage once, titled after it, and never a mesh', () => {
    const project = board()
    expect(addStep(project, 'anim1')).toMatchObject({ title: 'Fit the gear', instructions: '' })
    expect(addStep(project, 'anim1')).toBeNull()
    expect(addStep(project, 'piece')).toBeNull()
    expect(addStep(project, 'nothing')).toBeNull()
    expect(project.steps).toHaveLength(1)
  })

  it('says where a stage stands, and what comes before and after', () => {
    const project = board()
    for (const id of ['anim1', 'asm2', 'anim2']) addStep(project, id)
    expect(stepPlace(project, 'asm1')).toBeNull()
    const first = stepPlace(project, 'anim1')
    expect(first).toMatchObject({ number: 1, total: 3, prev: null })
    expect(first?.next?.stageId).toBe('asm2')
    const last = stepPlace(project, 'anim2')
    expect(last?.prev?.stageId).toBe('asm2')
    expect(last?.next).toBeNull()
  })

  it('reorders, stopping at the ends', () => {
    const project = board()
    const ids = ['anim1', 'asm2', 'anim2'].map((id) => addStep(project, id)!.id)
    moveStep(project, ids[2], -1)
    expect(project.steps.map((s) => s.stageId)).toEqual(['anim1', 'anim2', 'asm2'])
    moveStep(project, ids[0], -1)
    moveStep(project, ids[1], 5)
    expect(project.steps.map((s) => s.stageId)).toEqual(['anim1', 'anim2', 'asm2'])
  })
})

describe('saved steps', () => {
  it('are there, empty, for projects saved before they existed', () => {
    expect(board().steps).toEqual([])
  })

  it('drop the ones whose stage is gone, and a stage listed twice', () => {
    const project = board([
      { id: 'a', stageId: 'anim1', title: 'One', instructions: 'Push it in' },
      { id: 'b', stageId: 'gone', title: 'Two' },
      { id: 'c', stageId: 'anim1', title: 'Again' },
      { id: 'd', stageId: 'piece', title: 'A mesh' },
      { id: 'e', stageId: 'asm2' },
    ])
    expect(project.steps).toEqual([
      { id: 'a', stageId: 'anim1', title: 'One', instructions: 'Push it in' },
      { id: 'e', stageId: 'asm2', title: 'Box', instructions: '' },
    ])
  })
})
