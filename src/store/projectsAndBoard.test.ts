import { beforeEach, describe, expect, it, vi } from 'vitest'

import { timeAgo } from '@/lib/timeAgo'
import { useStore } from './index'

const state = () => useStore.getState()
const open = () => state().projects.find((p) => p.id === state().pid)!

beforeEach(() => {
  // (no browser storage here: saving fails, loudly — not what is tested)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useStore.setState((s) => {
    s.projects = []
    s.pid = null
    s.view = 'projects'
  })
})

describe('time ago', () => {
  const now = Date.UTC(2026, 10, 16, 12)
  const ago = (ms: number) => timeAgo(now - ms, now)
  const MIN = 60_000

  it('says it the way a person would', () => {
    expect(ago(20_000)).toBe('just now')
    expect(ago(5 * MIN)).toBe('5 min ago')
    expect(ago(3 * 60 * MIN)).toBe('3 h ago')
    expect(ago(30 * 60 * MIN)).toBe('yesterday')
    expect(ago(4 * 24 * 60 * MIN)).toBe('4 days ago')
    expect(ago(40 * 24 * 60 * MIN)).toBe('7 Oct 2026')
  })
})

describe('projects', () => {
  it('are told apart by name and know when they were made', () => {
    const a = state().createProject()
    const b = state().createProject()
    expect([a.name, b.name]).toEqual(['Project', 'Project 2'])
    expect(a.createdAt).toBeGreaterThan(0)
    expect(a.updatedAt).toBe(a.createdAt)
  })

  it('duplicate into an independent copy', () => {
    const source = state().createProject('Gear box')
    state().openProject(source.id)
    state().dropStageOnBoard('assembly', 0, 0)
    state().addFrame({ x: -100, y: -100, w: 300, h: 300 })
    state().duplicateProject(source.id)
    state().duplicateProject(source.id)

    const [, copy, second] = state().projects
    expect([copy.name, second.name]).toEqual(['Gear box copy', 'Gear box copy 2'])
    expect(copy.id).not.toBe(source.id)
    expect(copy.board).toEqual(open().board)
    expect(copy.board.frames).toHaveLength(1)
    // changing the original leaves the copy alone
    state().dropStageOnBoard('animation', 50, 0)
    expect(state().projects[1].board.nodes).toHaveLength(1)
  })

  it('note when they were last changed, without doing so on every edit', () => {
    const p = state().createProject()
    useStore.setState((s) => {
      s.projects[0].updatedAt = 1000
    })
    state().renameProject(p.id, 'Renamed')
    const touched = state().projects[0].updatedAt
    expect(touched).toBeGreaterThan(1000)
    state().renameProject(p.id, 'Renamed again')
    expect(state().projects[0].updatedAt).toBe(touched)
  })
})

describe('the board view', () => {
  beforeEach(() => {
    state().openProject(state().createProject().id)
  })

  it('fits every node into the view when a project is opened', () => {
    expect(state().boardFit).toBe(true)
    state().dropStageOnBoard('assembly', 1000, 1000)
    state().dropStageOnBoard('assembly', 3000, 2000)
    state().fitBoard(800, 600)
    const { pan, zoom, boardFit } = state()
    expect(boardFit).toBe(false)
    expect(zoom).toBeLessThan(1)
    // the middle of the nodes is in the middle of the view
    expect(pan.x + 2000 * zoom).toBeCloseTo(400)
    expect(pan.y + 1500 * zoom).toBeCloseTo(300)
  })

  it('never zooms in past life size to fit, and shows an empty board as it is', () => {
    state().fitBoard(800, 600)
    expect(state()).toMatchObject({ zoom: 1, pan: { x: 60, y: 60 } })
    state().dropStageOnBoard('assembly', 10, 10)
    state().fitBoard(800, 600)
    expect(state().zoom).toBe(1)
  })

  it('zooms keeping what is under the pointer where it is', () => {
    const before = state()
    // the board point under (300, 200)
    const point = { x: (300 - before.pan.x) / before.zoom, y: (200 - before.pan.y) / before.zoom }
    state().zoomAt(0.45, 300, 200)
    const { pan, zoom } = state()
    expect(zoom).toBeCloseTo(1.45)
    expect(pan.x + point.x * zoom).toBeCloseTo(300)
    expect(pan.y + point.y * zoom).toBeCloseTo(200)
  })

  it('says how to get a deleted stage back', () => {
    state().dropStageOnBoard('assembly', 0, 0)
    useStore.setState((s) => {
      s.notices = []
    })
    state().deleteNode(open().board.nodes[0].id)
    expect(state().notices.map((n) => n.kind)).toEqual(['info'])
  })
})
