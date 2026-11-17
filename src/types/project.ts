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
  /** The file's contents: their key in the file store (lib/meshFiles.ts). */
  hash: string | null
  /** The file's size in bytes (0: not known). */
  bytes: number
  /** Saves from before files had a store of their own carry the file here,
   *  as a data URL, until it is moved there (store/startup.ts). */
  data: string | null
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
}

/** 'solved': the two points touch. 'gap': they could not be brought
 *  together (the link keeps how far apart they are). */
export type LinkState = 'solved' | 'gap'
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
  /** Light tracks: the intensity the light reaches by the end of the
   *  action (null: the action leaves it as it is). */
  toIntensity: number | null
}

export type TrackTargetKind = 'mesh' | 'camera' | 'light'

export interface Track {
  id: string
  targetKind: TrackTargetKind
  /** The piece's node id / part key; a light's key (`light:<id>`); null
   *  for the camera. */
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
}

export type LightKind = 'ambient' | 'directional' | 'point' | 'spot'

/** A light of an animation stage: an object in its world, like the camera.
 *  It shines down its own -Z (position and rotation in `pose`); an ambient
 *  light has no place or direction and ignores it. */
export interface StageLight {
  id: string
  kind: LightKind
  name: string
  /** Switched on. */
  visible: boolean
  color: string
  /** 1 is roughly "a normal light"; the same scale for every kind. */
  intensity: number
  pose: Pose
  /** Point / spot: how far it reaches, in world units (0 = no limit). */
  distance: number
  /** Spot: half the cone's opening, in degrees. */
  angle: number
  /** Spot: how soft the cone's edge is, 0 (hard) to 1. */
  penumbra: number
  castShadow: boolean
}

export type EnvironmentPreset = 'studio' | 'sky' | 'sunset'

/** Soft light and reflections from all around, from a built-in backdrop
 *  (never visible itself). */
export interface StageEnvironment {
  preset: EnvironmentPreset
  intensity: number
  /** Turned around the vertical axis, in degrees. */
  rotation: number
}

/** An optional ground under the pieces: only the shadows that fall on it
 *  ('shadow'), or a solid surface. */
export interface StageFloor {
  visible: boolean
  mode: 'shadow' | 'solid'
  /** World Y it lies at. */
  height: number
  /** 'solid': its color. */
  color: string
  /** 'shadow': how dark the shadows on it are, 0 to 1. */
  shadow: number
}

/** The shape of the animation camera's frame — what "look through" shows
 *  and video export records. */
export type FrameFormat = '16:9' | '9:16' | '1:1' | '4:3'

export interface Stage {
  kind: StageKind
  frame: FrameFormat
  /** A pose and a look for each input. Which inputs there are is said by
   *  the board's edges alone; this list is kept in line with them
   *  (lib/stageInputs.ts). */
  members: StageMember[]
  links: KeypointLink[]
  camera: StageCamera | null
  tracks: Track[]
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
  /** Animation stages: their own lighting. With no lights of its own a
   *  stage is lit by the default lighting. */
  lights: StageLight[]
  environment: StageEnvironment | null
  floor: StageFloor | null
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

/** A presentation: a rectangle drawn on the board around the animations
 *  it plays, one after another, left to right. Which animations those are
 *  is said by where the nodes stand alone (lib/frames.ts). */
export interface BoardFrame {
  id: string
  label: string
  /** Its top-left corner and size, in board px. */
  x: number
  y: number
  w: number
  h: number
  /** The order its animations play in, by stage node id, once the author
   *  has set one. The ones not listed (all of them, while this is empty)
   *  follow as they stand on the board: left to right. */
  order: string[]
}

export interface Board {
  nodes: BoardNode[]
  edges: BoardEdge[]
  frames: BoardFrame[]
}

export interface Project {
  id: string
  name: string
  /** When it was made and last changed, in ms since the epoch (0: not
   *  known — saved before this was kept). */
  createdAt: number
  updatedAt: number
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
