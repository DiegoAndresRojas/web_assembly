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

export type MeshExt = 'glb' | 'gltf' | 'obj' | 'stl'

export interface MeshRecord {
  id: string
  name: string
  ext: string
  origin: 'original'
  data: string | null // data URL
  color: string | null
}

export type NodeKind = 'mesh' | 'assembly' | 'observer' | 'animation'
export type StageKind = 'assembly' | 'observer' | 'animation'
export type WorldMode = 'assembly' | 'observer' | 'animate'

export interface BoardNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  meshId: string | null
  label: string | null
  /** Per board node, so the same file dropped twice can be colored apart. */
  color: string | null
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

export interface TimelineAction {
  id: string
  kind: 'move'
  fromPose: Pose
  toPose: Pose
  fromLinked: boolean
  toLinked: boolean
  start: number
  duration: number
}

export type TrackTargetKind = 'mesh' | 'camera'

export interface Track {
  id: string
  targetKind: TrackTargetKind
  nodeId: string | null
  initPose: Pose
  actions: TimelineAction[]
}

export interface StageCamera {
  pose: Pose
  tracked: boolean
}

export interface StageUnion {
  at: number
}

export interface Stage {
  kind: StageKind
  members: StageMember[]
  links: KeypointLink[]
  camera: StageCamera | null
  tracks: Track[]
  observing: string[]
  union: StageUnion | null
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
