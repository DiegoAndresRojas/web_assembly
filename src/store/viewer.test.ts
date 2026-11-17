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

  it('leaves the nodes where they are when a frame is dragged', () => {
    const pid = load(sample([{ id: 'f', x: 200, y: 0, w: 300, h: 200 }]))
    const s = useStore.getState()
    s.openProject(pid)
    const project = () => useStore.getState().projects[0]
    s.moveFrame('f', 1000, 30)
    expect(project().board.nodes.find((n) => n.id === 'anim')).toMatchObject({ x: 300, y: 100 })
    // …so what it no longer reaches is not in it any more
    expect(playlistOf(project(), 'f').scenes).toEqual([])
  })

  it('plays in the order the author set, until the board’s is asked for again', () => {
    const pid = load(sample([{ id: 'f', x: 0, y: 0, w: 400, h: 200 }]))
    const s = useStore.getState()
    s.openProject(pid)
    const order = () =>
      playlistOf(useStore.getState().projects[0], 'f').scenes.map((x) => x.stageId)
    expect(order()).toEqual(['still', 'anim'])
    s.moveFrameScene('f', 'anim', -1)
    expect(order()).toEqual(['anim', 'still'])
    // (already first: nothing to do, nothing to undo)
    s.moveFrameScene('f', 'anim', -1)
    // moving the nodes about no longer changes it
    s.moveNode('anim', 390, 100)
    expect(order()).toEqual(['anim', 'still'])
    // one that comes in later goes last
    s.dropStageOnBoard('animation', 20, 100)
    expect(order().slice(0, 2)).toEqual(['anim', 'still'])
    expect(order()).toHaveLength(3)
    s.resetFrameOrder('f')
    expect(order().slice(1)).toEqual(['still', 'anim'])
    s.boardUndo()
    expect(order().slice(0, 2)).toEqual(['anim', 'still'])
  })

  it('shows what the author wrote about each animation', () => {
    const pid = load(sample())
    const s = useStore.getState()
    s.openProject(pid)
    s.setStageNote('anim', '  Push the gear until it clicks.\n')
    const scenes = playlistOf(useStore.getState().projects[0], null).scenes
    expect(scenes.map((x) => x.note)).toEqual(['Push the gear until it clicks.', ''])
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
    // (whose camera it is seen through stays as the viewer left it)
    s.setCameraView(false)
    s.viewScene('still')
    expect(useStore.getState()).toMatchObject({ aid: 'still', playing: false, cameraView: false })
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
