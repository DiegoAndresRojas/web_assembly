// Core domain types. Field-for-field port of only_js/src/store/migrations.js's
// shapes — see that file for the reasoning behind the schema (nodeId-keyed
// members/links/tracks, etc.).

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Pose {
  pos: Vec3
  rot: Vec3
}

export interface MeshRecord {
  id: string
  name: string
  ext: string
  origin: 'original'
  data: string | null // data URL
  color: string | null
  /** Bounding-box size in the file's native units, measured the first time
   *  the file is dropped on the board (null until then). */
  size: Vec3 | null
}

export type NodeKind = 'mesh' | 'assembly' | 'animation'
export type StageKind = 'assembly' | 'animation'
export type WorldMode = 'assembly' | 'animate'

export interface BoardNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  meshId: string | null
  label: string | null
  /** Per board node, so the same file dropped twice can be colored apart. */
  color: string | null
  /** Uniform scale over the file's native units (1 = as authored) — per
   *  node too, e.g. a part modelled in meters brought up to whole units. */
  scale: number
}

export interface BoardEdge {
  id: string
  from: string // mesh board-node id, or an upstream stage node id
  to: string // stage board-node id
}

export interface StageMember {
  nodeId: string
  visible: boolean
  opacity: number
  pose: Pose
  color: string | null
}

export type LinkState = 'pending' | 'solved' | 'gap'
export type Axis = 'x' | 'y' | 'z'

export interface KeypointLink {
  id: string
  nodeA: string
  pointA: Vec3
  normalA: Vec3
  nodeB: string
  pointB: Vec3
  normalB: Vec3
  axis: Axis
  state: LinkState
  gap: number
}

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export interface TimelineAction {
  id: string
  kind: 'move'
  /** Own start pose — only used when `fromLinked` is off. */
  fromPose: Pose
  /** Own end pose — only used when `toLinked` is off. */
  toPose: Pose
  /** Start where the previous action on the track ended (or the track's
   *  initial pose): actions chain instead of jumping. */
  fromLinked: boolean
  /** End at the piece's connector pose — where the assembly's links put
   *  it — so a piece can fly back into place. */
  toLinked: boolean
  ease: Ease
  start: number
  duration: number
}

export type TrackTargetKind = 'mesh' | 'camera'

export interface Track {
  id: string
  targetKind: TrackTargetKind
  nodeId: string | null
  initPose: Pose
  /** Start where the piece already is — where its assembly put it, or
   *  where the last animation earlier in the chain left it — instead of at
   *  `initPose` (which then only records the last pose chosen by hand). */
  initLinked: boolean
  actions: TimelineAction[]
}

export interface StageCamera {
  /** What the author calls it — how it is told apart when another
   *  animation imports it. */
  name: string
  pose: Pose
  tracked: boolean
}

export interface StageUnion {
  at: number
}

/** The shape of the animation camera's frame — what "look through" shows
 *  and video export records. */
export type FrameFormat = '16:9' | '9:16' | '1:1' | '4:3'

export interface Stage {
  kind: StageKind
  frame: FrameFormat
  members: StageMember[]
  links: KeypointLink[]
  camera: StageCamera | null
  tracks: Track[]
  union: StageUnion | null
  /** Visibility / opacity of pieces inside assembly inputs, by part key
   *  (an animation can hide or fade a single piece of an assembly). */
  partLooks: Record<string, PartLook>
  /** Animation stages: where pieces start when that is not where their
   *  assembly put them, by node id / part key — taken from the animations
   *  earlier in the chain when an assembly is first wired in, or imported
   *  from another animation by the author. */
  startPoses: Record<string, Pose>
  /** Pieces of this stage's assembly inputs that were unlocked from them,
   *  by part key (`asmNodeId/pieceNodeId`). */
  partOverrides: Record<string, PartOverride>
}

/** A piece of an assembly input taken out of the pose it was assembled in.
 *  `free`: released from the assembly — a body of its own in this stage,
 *  `pose` in the stage's space. Not free: re-attached where it was left,
 *  `pose` relative to the assembly, moving with it again. */
export interface PartOverride {
  free: boolean
  pose: Pose
}

export interface PartLook {
  visible: boolean
  opacity: number
}

export interface Board {
  nodes: BoardNode[]
  edges: BoardEdge[]
}

export interface Project {
  id: string
  name: string
  meshes: MeshRecord[]
  board: Board
  stages: Record<string, Stage>
}

/** A stage input: a mesh node (`mesh` set) or an upstream assembly node
 *  (`mesh` null) that comes in as one rigid part. */
export interface MembersRow {
  node: BoardNode
  mesh: MeshRecord | null
}

export interface PickHit {
  nodeId: string
  point: Vec3
  normal: Vec3
}
