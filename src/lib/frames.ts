// Presentations: frames drawn on the board around the animations they
// play. A frame holds no list — an animation is in it while its node
// stands inside the rectangle, and plays in the order the nodes are read:
// left to right, then top to bottom.
import { stageName } from './cameras'
import { FRAME_H, FRAME_HEAD, FRAME_MIN_H, FRAME_MIN_W, FRAME_W } from './constants'
import { stageDuration } from './timeline'
import { uid } from './utils'
import type { BoardFrame, BoardNode, Project } from '@/types/project'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A rectangle from two opposite corners, whichever way it was dragged. */
export function rectFrom(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

function holds(frame: Rect, node: BoardNode): boolean {
  return (
    node.x >= frame.x &&
    node.x <= frame.x + frame.w &&
    node.y >= frame.y &&
    node.y <= frame.y + frame.h
  )
}

/** Every node standing inside the frame — what moves along with it. */
export function nodesInFrame(project: Project, frame: Rect): BoardNode[] {
  return project.board.nodes.filter((n) => holds(frame, n))
}

/** The animations a frame plays, in order. */
export function frameAnimations(project: Project, frame: Rect): BoardNode[] {
  return nodesInFrame(project, frame)
    .filter((n) => n.kind === 'animation')
    .sort((a, b) => a.x - b.x || a.y - b.y)
}

/** For each animation that is in a frame, its place in it (1-based) — in
 *  the first frame that holds it, for one standing in several. */
export function framedPlaces(project: Project): Map<string, number> {
  const places = new Map<string, number>()
  for (const frame of project.board.frames) {
    frameAnimations(project, frame).forEach((node, i) => {
      if (!places.has(node.id)) places.set(node.id, i + 1)
    })
  }
  return places
}

/** A new frame of the given rectangle (grown to the least a frame can be),
 *  named apart from the ones there are. Mutates the project — an immer
 *  draft in the store. */
export function addFrame(project: Project, rect: Rect): BoardFrame {
  const taken = new Set(project.board.frames.map((f) => f.label))
  let n = project.board.frames.length + 1
  while (taken.has(`Presentation ${n}`)) n++
  const frame: BoardFrame = {
    id: uid(),
    label: `Presentation ${n}`,
    x: rect.x,
    y: rect.y,
    w: Math.max(FRAME_MIN_W, rect.w),
    h: Math.max(FRAME_MIN_H, rect.h),
  }
  project.board.frames.push(frame)
  return frame
}

/** A frame of the usual size around a point: its top strip stays clear of
 *  a node standing right there. */
export function frameAround(x: number, y: number): Rect {
  return { x: x - FRAME_W / 2, y: y - (FRAME_H + FRAME_HEAD) / 2, w: FRAME_W, h: FRAME_H }
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** `start` with one corner dragged by (dx, dy), the opposite one staying
 *  put — never smaller than a frame can be. */
export function resizeRect(start: Rect, corner: Corner, dx: number, dy: number): Rect {
  const right = start.x + start.w
  const bottom = start.y + start.h
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  const w = Math.max(FRAME_MIN_W, west ? start.w - dx : start.w + dx)
  const h = Math.max(FRAME_MIN_H, north ? start.h - dy : start.h + dy)
  return { x: west ? right - w : start.x, y: north ? bottom - h : start.y, w, h }
}

/** How far down the chain a stage is: the longest way to it from a mesh. */
function depthOf(project: Project, nodeId: string, path: Set<string> = new Set()): number {
  if (path.has(nodeId)) return 0
  const node = project.board.nodes.find((n) => n.id === nodeId)
  if (!node || node.kind === 'mesh') return 0
  const next = new Set(path).add(nodeId)
  const inputs = project.board.edges.filter((e) => e.to === nodeId).map((e) => e.from)
  return Math.max(0, ...inputs.map((id) => depthOf(project, id, next))) + 1
}

/** One animation of a presentation, as the viewer shows it. */
export interface Scene {
  stageId: string
  title: string
  /** Seconds its animation lasts (0: nothing moves in it). */
  duration: number
}

export interface Playlist {
  /** The frame it comes from; null when the project has none to play. */
  frame: BoardFrame | null
  scenes: Scene[]
}

/** What the viewer plays: the animations of the given frame — or, with no
 *  frame given, of the first frame that holds any. A project with no such
 *  frame plays every animation, in the order the chain builds them. */
export function playlistOf(project: Project, frameId: string | null): Playlist {
  const scene = (node: BoardNode): Scene => {
    const stage = project.stages[node.id]
    return { stageId: node.id, title: stageName(node), duration: stage ? stageDuration(stage) : 0 }
  }
  const frames = project.board.frames
  const frame = frameId
    ? frames.find((f) => f.id === frameId)
    : frames.find((f) => frameAnimations(project, f).length > 0)
  if (frame) return { frame, scenes: frameAnimations(project, frame).map(scene) }
  if (frameId) return { frame: null, scenes: [] }
  const loose = project.board.nodes
    .filter((n) => n.kind === 'animation')
    .map((node) => ({ node, depth: depthOf(project, node.id) }))
    .sort((a, b) => a.depth - b.depth || stageName(a.node).localeCompare(stageName(b.node)))
  return { frame: null, scenes: loose.map((entry) => scene(entry.node)) }
}
