import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeProject } from '@/lib/migrations'
import { sequenceOf } from '@/lib/steps'
import { useStore } from './index'

const pose = (x: number) => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

/** piece → asm → an animation that moves the piece for 2 s, and an empty one. */
function sample(steps: unknown[] = []) {
  return normalizeProject({
    name: 'Sample',
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'piece', kind: 'mesh', meshId: 'file' },
        { id: 'asm', kind: 'assembly', label: 'Gear' },
        { id: 'anim', kind: 'animation', label: 'Fit the gear' },
        { id: 'still', kind: 'animation', label: 'Look at it' },
      ],
      edges: [
        { from: 'piece', to: 'asm' },
        { from: 'asm', to: 'anim' },
        { from: 'asm', to: 'still' },
      ],
    },
    stages: {
      anim: {
        kind: 'animation',
        tracks: [
          {
            targetKind: 'mesh',
            nodeId: 'asm',
            initPose: pose(0),
            actions: [{ toPose: pose(5), start: 0, duration: 2, ease: 'linear' }],
          },
        ],
      },
    },
    steps,
  })!
}

function load(project: NonNullable<ReturnType<typeof normalizeProject>>) {
  useStore.setState((s) => {
    s.projects = [project]
    s.view = 'projects'
    s.pid = null
    s.aid = null
    s.notices = []
  })
  return project.id
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('what the viewer walks through', () => {
  it('is the steps — or the animations, for a project that has none yet', () => {
    expect(sequenceOf(sample()).map((s) => s.stageId)).toEqual(['anim', 'still'])
    const withSteps = sample([{ stageId: 'asm', title: 'The gear' }])
    expect(sequenceOf(withSteps).map((s) => s.title)).toEqual(['The gear'])
  })
})

describe('the viewer', () => {
  it('opens on the first step and plays it', () => {
    const pid = load(sample())
    useStore.getState().openViewer(pid, 'projects')
    expect(useStore.getState()).toMatchObject({
      view: 'viewer',
      pid,
      aid: 'anim',
      wmode: 'animate',
      playing: true,
      playT: 0,
      loop: false,
    })
  })

  it('shows a step with nothing to play as it stands', () => {
    const pid = load(sample())
    const s = useStore.getState()
    s.openViewer(pid, 'projects')
    s.viewStep('still')
    expect(useStore.getState()).toMatchObject({ aid: 'still', playing: false })
    s.viewStep('asm')
    expect(useStore.getState()).toMatchObject({ aid: 'asm', wmode: 'assembly', playing: false })
  })

  it('goes back to where it was opened from, leaving the author’s views alone', () => {
    const pid = load(sample())
    const s = useStore.getState()
    s.openProject(pid)
    s.openViewer(pid, 'board')
    s.viewStep('still')
    s.closeViewer()
    expect(useStore.getState()).toMatchObject({ view: 'board', pid, playing: false })
    expect(useStore.getState().stageViews.still).toBeUndefined()

    s.openViewer(pid, 'projects')
    s.closeViewer()
    expect(useStore.getState()).toMatchObject({ view: 'projects', pid: null })
  })

  it('says so when there is nothing to play', () => {
    const empty = normalizeProject({ name: 'Empty' })!
    const pid = load(empty)
    useStore.getState().openViewer(pid, 'projects')
    expect(useStore.getState().view).toBe('projects')
    expect(useStore.getState().notices).toHaveLength(1)
  })
})
