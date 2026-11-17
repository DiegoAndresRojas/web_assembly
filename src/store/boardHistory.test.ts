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

  it('brings a deleted stage back', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    s.dropStageOnBoard('animation', 100, 0)
    const [asm, anim] = stageIds()

    s.deleteNode(asm)
    expect(stageIds()).toEqual([anim])
    s.boardUndo()
    expect(stageIds()).toEqual([asm, anim])
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

  it('selects several nodes, moves them together and deletes them as one', () => {
    const s = useStore.getState()
    s.dropStageOnBoard('assembly', 0, 0)
    s.dropStageOnBoard('animation', 100, 0)
    s.dropStageOnBoard('animation', 200, 0)
    const [a, b, c] = stageIds()
    const sel = () => useStore.getState()

    s.selectNode(a)
    expect(sel()).toMatchObject({ selId: a, selIds: [a] })
    s.toggleNodeSelected(b)
    // (with several, no single node has the menu)
    expect(sel()).toMatchObject({ selId: null, selIds: [a, b] })
    s.toggleNodeSelected(a)
    expect(sel()).toMatchObject({ selId: b, selIds: [b] })
    s.selectNodes([a, b, b])
    expect(sel().selIds).toEqual([a, b])

    s.pushBoardHistory()
    s.moveNodes([
      { id: a, x: 10, y: 10 },
      { id: b, x: 110, y: 10 },
    ])
    expect(project().board.nodes.map((n) => [n.x, n.y])).toEqual([
      [10, 10],
      [110, 10],
      [200, 0],
    ])
    s.boardUndo()
    expect(project().board.nodes[0]).toMatchObject({ x: 0, y: 0 })

    s.deleteNodes([a, b])
    expect(stageIds()).toEqual([c])
    expect(sel().selIds).toEqual([])
    s.boardUndo()
    expect(stageIds()).toEqual([a, b, c])
  })

  it('takes back a frame: drawn, renamed, dragged, deleted', () => {
    const s = useStore.getState()
    const frames = () => project().board.frames
    s.addFrame({ x: 0, y: 0, w: 400, h: 300 })
    const id = frames()[0].id
    expect(useStore.getState().selFrame).toBe(id)
    s.renameFrame(id, '  How it goes together ')
    s.renameFrame(id, '   ')
    expect(frames()[0].label).toBe('How it goes together')

    s.pushBoardHistory()
    s.moveFrame(id, 40, 40)
    s.moveFrame(id, 90, 90)
    s.boardUndo()
    expect(frames()[0]).toMatchObject({ x: 0, y: 0 })

    s.deleteFrame(id)
    expect(frames()).toEqual([])
    expect(useStore.getState().selFrame).toBeNull()
    s.boardUndo()
    expect(frames()[0].label).toBe('How it goes together')
    s.boardUndo()
    expect(frames()[0].label).toBe('Presentation 1')
    s.boardUndo()
    expect(frames()).toEqual([])
  })
})
