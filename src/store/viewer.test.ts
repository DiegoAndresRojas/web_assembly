import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeProject } from '@/lib/migrations'
import { playlistOf } from '@/lib/frames'
import { useStore } from './index'

const pose = (x: number) => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } })

/** piece → asm → an animation that moves the piece for 2 s, and an empty one. */
function sample(frames: unknown[] = []) {
  return normalizeProject({
    name: 'Sample',
    meshes: [{ id: 'file', name: 'part.stl', ext: 'stl' }],
    board: {
      nodes: [
        { id: 'piece', kind: 'mesh', meshId: 'file' },
        { id: 'asm', kind: 'assembly', label: 'Gear' },
        { id: 'anim', kind: 'animation', label: 'Fit the gear', x: 300, y: 100 },
        { id: 'still', kind: 'animation', label: 'Look at it', x: 100, y: 100 },
      ],
      frames,
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
  const ids = (project: ReturnType<typeof sample>, frameId: string | null = null) =>
    playlistOf(project, frameId).scenes.map((s) => s.stageId)

  it('is every animation, for a project with no frame around any', () => {
    expect(ids(sample())).toEqual(['anim', 'still'])
    expect(ids(sample([{ id: 'far', x: 5000, y: 5000, w: 300, h: 300 }]))).toEqual([
      'anim',
      'still',
    ])
  })

  it('is the animations inside the frame, left to right, as long as each lasts', () => {
    const both = sample([{ id: 'f', label: 'Gear box', x: 0, y: 0, w: 400, h: 200 }])
    expect(playlistOf(both, 'f')).toMatchObject({
      frame: { label: 'Gear box' },
      scenes: [
        { stageId: 'still', title: 'Look at it', duration: 0 },
        { stageId: 'anim', title: 'Fit the gear', duration: 2 },
      ],
    })
    // (the first frame with something to play is the project's)
    expect(ids(both)).toEqual(['still', 'anim'])
    // a node only half way in counts by its middle
    const one = sample([{ id: 'f', x: 0, y: 0, w: 290, h: 200 }])
    expect(ids(one, 'f')).toEqual(['still'])
    expect(ids(one, 'gone')).toEqual([])
  })
})

describe('the viewer', () => {
  it('plays the frame it was opened from', () => {
    const pid = load(sample([{ id: 'f', x: 200, y: 0, w: 300, h: 200 }]))
    const s = useStore.getState()
    s.openProject(pid)
    s.openViewer(pid, 'board', 'f')
    expect(useStore.getState()).toMatchObject({ view: 'viewer', viewerFrame: 'f', aid: 'anim' })
    s.closeViewer()
    // an empty frame has nothing to play: says so and stays on the board
    s.addFrame({ x: 9000, y: 9000, w: 300, h: 300 })
    s.openViewer(pid, 'board', useStore.getState().selFrame!)
    expect(useStore.getState().view).toBe('board')
    expect(useStore.getState().notices).toHaveLength(1)
  })

  it('takes the nodes inside a frame along when it is dragged', () => {
    const pid = load(sample([{ id: 'f', x: 200, y: 0, w: 300, h: 200 }]))
    const s = useStore.getState()
    s.openProject(pid)
    s.moveFrame('f', 250, 30)
    const at = (id: string) => {
      const n = useStore.getState().projects[0].board.nodes.find((x) => x.id === id)!
      return [n.x, n.y]
    }
    expect(at('anim')).toEqual([350, 130])
    expect(at('still')).toEqual([100, 100])
  })

  it('opens on the first animation and plays it', () => {
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

  it('shows an animation with nothing to play as it stands', () => {
    const pid = load(sample())
    const s = useStore.getState()
    s.openViewer(pid, 'projects')
    s.setCameraView(false)
    s.viewScene('still')
    expect(useStore.getState()).toMatchObject({ aid: 'still', playing: false, cameraView: true })
  })

  it('goes back to where it was opened from, leaving the author’s views alone', () => {
    const pid = load(sample())
    const s = useStore.getState()
    s.openProject(pid)
    s.openViewer(pid, 'board')
    s.viewScene('still')
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
