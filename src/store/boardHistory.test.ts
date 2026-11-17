import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from './index'

const project = () => {
  const s = useStore.getState()
  return s.projects.find((p) => p.id === s.pid)!
}
const stageIds = () =>
  project()
    .board.nodes.filter((n) => n.kind !== 'mesh')
    .map((n) => n.id)

beforeEach(() => {
  // (no browser storage here: saving fails, loudly — not what is tested)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const s = useStore.getState()
  s.openProject(s.createProject('Test').id)
})

describe('undo on the board', () => {
  it('takes back and brings back a node, with its stage', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    const [id] = stageIds()
    expect(useStore.getState().canBoardUndo).toBe(true)

    s.boardUndo()
    expect(stageIds()).toEqual([])
    expect(project().stages[id]).toBeUndefined()
    expect(useStore.getState()).toMatchObject({ canBoardUndo: false, canBoardRedo: true })

    s.boardRedo()
    expect(stageIds()).toEqual([id])
    expect(project().stages[id]?.kind).toBe('assembly')
  })

  it('brings a deleted stage back with its place in the steps', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    s.dropStageOnBoard('animation', 100, 0)
    s.addEveryStep()
    const [asm, anim] = project().steps.map((x) => x.stageId)
    expect(stageIds().sort()).toEqual([asm, anim].sort())

    s.deleteNode(asm)
    expect(project().steps.map((x) => x.stageId)).toEqual([anim])
    s.boardUndo()
    expect(project().steps.map((x) => x.stageId)).toEqual([asm, anim])
    expect(project().stages[asm]).toBeDefined()
  })

  it('does not count an edit that changed nothing', () => {
    const s = useStore.getState()
    s.deleteNode('not-there')
    s.renameNode('not-there', 'Name')
    expect(useStore.getState().canBoardUndo).toBe(false)
  })

  it('undoes a whole drag at once', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 10, 20)
    const [id] = stageIds()
    s.pushBoardHistory()
    s.moveNode(id, 50, 60)
    s.moveNode(id, 90, 100)
    s.boardUndo()
    expect(project().board.nodes[0]).toMatchObject({ x: 10, y: 20 })
  })

  it('forgets the board history when a stage is opened', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    const [id] = stageIds()
    s.openStage(id)
    expect(useStore.getState().canBoardUndo).toBe(false)
    s.boardUndo()
    expect(stageIds()).toEqual([id])
  })

  it('edits steps: title, instructions, order — each undoable', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    s.dropStageOnBoard('animation', 100, 0)
    s.addEveryStep()
    const [first, second] = project().steps
    s.updateStep(first.id, { title: '  Fit the gear ', instructions: 'Push until it clicks' })
    s.updateStep(first.id, { title: '   ' })
    expect(project().steps[0]).toMatchObject({
      title: 'Fit the gear',
      instructions: 'Push until it clicks',
    })
    s.moveStep(second.id, -1)
    expect(project().steps.map((x) => x.id)).toEqual([second.id, first.id])
    s.boardUndo()
    expect(project().steps.map((x) => x.id)).toEqual([first.id, second.id])
    s.boardUndo()
    expect(project().steps[0].instructions).toBe('')
  })
})
