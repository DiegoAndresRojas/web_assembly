// The full store shape, assembled from one interface per slice file. Kept
// in one place because every slice's actions are allowed to read/update
// any other slice's state (they're combined into a single Zustand store) —
// see store/index.ts.
import type { Draft } from 'immer'

import type { SnapMode } from '@/lib/three/surfaceSnap'
import type { VideoBackground } from '@/lib/videoFormat'
import type {
  Axis,
  FrameFormat,
  KeypointLink,
  PickHit,
  Pose,
  Project,
  StageCamera,
  StageMember,
  TimelineAction,
  Track,
  Vec3,
  WorldMode,
} from '@/types/project'

// ---------- projects ----------
export interface DeleteConfirm {
  kind: 'project' | 'mesh' | 'track' | 'camera'
  id: string
  label: string
}

export interface ColorEdit {
  nodeId: string
  value: string
}

export interface ScaleEdit {
  nodeId: string
  /** The file's size in native units. */
  size: Vec3
  factor: number
  /** Opened automatically because a dropped piece is very small. */
  prompted: boolean
}

export interface ProjectsState {
  projects: Project[]
  confirm: DeleteConfirm | null
  colorEdit: ColorEdit | null
  scaleEdit: ScaleEdit | null
}

export interface ProjectsActions {
  createProject: (name?: string) => Project
  renameProject: (pid: string, name: string) => void
  askDeleteProject: (id: string, name: string) => void
  cancelDeleteConfirm: () => void
  confirmDelete: () => void
  addMeshes: (pid: string, files: { name: string; ext: string; data: string | null }[]) => void
  askDeleteMesh: (id: string, name: string) => void
  openColorEditor: (nodeId: string) => void
  cancelColorEditor: () => void
  setColorDraft: (value: string) => void
  applyColorEditor: () => void
  /** Measures the node's file if needed and opens the scale dialog —
   *  `prompted`: only if the piece is very small, suggesting a factor. */
  openScaleEditor: (nodeId: string, prompted?: boolean) => Promise<void>
  setScaleDraft: (factor: number) => void
  cancelScaleEditor: () => void
  applyScaleEditor: () => void
}

// ---------- navigation ----------
export interface NavigationState {
  view: 'projects' | 'board' | 'world'
  pid: string | null
  aid: string | null
  wmode: WorldMode
}

export interface NavigationActions {
  openProject: (id: string) => void
  backToProjects: () => void
  openStage: (nodeId: string) => void
  backToBoard: () => void
}

// ---------- board ----------
export interface LinkingDraft {
  from: string
  x: number
  y: number
}

export interface BoardState {
  pan: { x: number; y: number }
  zoom: number
  tool: 'select' | 'pan'
  ctrlDown: boolean
  hover: string | null
  selId: string | null
  selEdge: string | null
  linking: LinkingDraft | null
  meshFilterExt: string | null
  hoverAssembly: boolean
  hoverAnimation: boolean
}

export interface BoardActions {
  effectiveTool: () => 'select' | 'pan'
  setTool: (mode: 'select' | 'pan') => void
  setCtrlDown: (down: boolean) => void
  zoomBy: (delta: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  setPan: (x: number, y: number) => void
  dropMeshOnBoard: (meshId: string, x: number, y: number) => void
  dropStageOnBoard: (kind: 'assembly' | 'animation', x: number, y: number) => void
  moveNode: (nodeId: string, x: number, y: number) => void
  linkIfDropped: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  hoverNode: (nodeId: string | null) => void
  /** Adds an independent copy of a node next to it and selects the copy. */
  duplicateNode: (nodeId: string) => void
  deleteNode: (nodeId: string) => void
  startLinking: (nodeId: string, x: number, y: number) => void
  updateLinking: (x: number, y: number) => void
  completeLinking: (x: number, y: number) => void
  cancelLinking: () => void
  selectEdge: (edgeId: string | null) => void
  deleteSelectedEdge: () => void
  removeEdge: (edgeId: string) => void
  setMeshFilter: (ext: string | null) => void
  setPaletteHover: (which: 'assembly' | 'animation' | null) => void
}

// ---------- world (assembly/animate shared) ----------
export interface WorldState {
  worldSelId: string | null
  gizmoMode: 'translate' | 'rotate'
  hint: string
  opacityOpenId: string | null
}

export interface WorldActions {
  selectWorldObject: (nodeId: string | null) => void
  /** From a piece inside an assembly input up to the assembly holding it
   *  (deselects at the top). */
  selectParentPiece: () => void
  setGizmoMode: (mode: 'translate' | 'rotate') => void
  setHint: (hint: string) => void
  toggleMemberVisible: (nodeId: string) => void
  setMemberOpacity: (nodeId: string, value: number) => void
  /** Visibility / opacity of one piece inside an assembly input, by part
   *  key, in the open stage. */
  togglePartVisible: (key: string) => void
  setPartOpacity: (key: string, value: number) => void
  toggleOpacityUI: (nodeId: string) => void
  removeMember: (nodeId: string) => void
  syncStageMembers: (stageId: string) => void
}

// ---------- history (undo/redo for the open stage) ----------
export interface StageSnapshot {
  members: StageMember[]
  links: KeypointLink[]
  tracks: Track[]
  camera: StageCamera | null
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  history: StageSnapshot[]
  future: StageSnapshot[]
}

export interface HistoryActions {
  /** Snapshot the open stage before an undoable edit. */
  pushHistory: () => void
  undo: () => void
  redo: () => void
  clearHistory: () => void
}

// ---------- assembly (keypoint linking) ----------
export interface AssemblyState {
  kpOn: boolean
  /** 'edges' = corners + edge midpoints, 'faces' = flat-face centers. */
  kpMode: SnapMode
  pendingPicks: PickHit[]
  kpEditing: string | null
  gapPending: { linkId: string; gap: number } | null
}

export interface AssemblyActions {
  toggleKp: (on: boolean) => void
  setKpMode: (mode: SnapMode) => void
  pickPoint: (hit: PickHit) => void
  /** Persists a member pose edited directly in the viewport (gizmo),
   *  as an undoable step. */
  setMemberPose: (nodeId: string, pose: Pose) => void
  removeLink: (linkId: string) => void
  acceptGap: () => void
  rejectGap: () => void
  openKpEdit: (linkId: string) => void
  closeKpEdit: () => void
  cancelKpEdit: () => void
  setKpRotAxis: (axis: Axis, value: number) => void
  doUnion: () => void
  undoUnion: () => void
}

// ---------- animation ----------
/** What the timeline inspector is showing: one action, or a track's
 *  initial pose (`'init'`). */
export interface TimelineSelection {
  trackId: string
  actionId: string | 'init'
}

export type ActionPatch = Partial<
  Pick<TimelineAction, 'start' | 'duration' | 'ease' | 'fromLinked' | 'toLinked' | 'fromPose' | 'toPose'>
>

export interface AnimationState {
  playT: number
  playing: boolean
  loop: boolean
  snap: boolean
  /** Timeline zoom. */
  pxPerSecond: number
  dockHeight: number
  /** Look through the animation camera while playing / scrubbing. */
  cameraView: boolean
  selection: TimelineSelection | null
}

export interface AnimationActions {
  onAnimPlay: () => void
  seekTo: (t: number) => void
  setLoop: (on: boolean) => void
  setSnap: (on: boolean) => void
  setZoom: (pxPerSecond: number) => void
  setDockHeight: (px: number) => void
  setCameraView: (on: boolean) => void
  /** The shape of the open stage's camera frame (preview and export). */
  setStageFrame: (format: FrameFormat) => void

  addMeshTrack: (nodeId: string) => void
  addCameraTrack: (currentCameraPose?: Pose) => void
  removeTrack: (trackId: string) => void
  confirmRemoveTrack: () => void
  onCamKill: () => void
  confirmCamDelete: () => void
  cancelCamDelete: () => void

  selectAction: (sel: TimelineSelection | null) => void
  /** New chained action at `t` (1 s, or up to the next action), ending at
   *  `toPose` or wherever the track is at `t`. Returns its id. */
  addActionAt: (trackId: string, t: number, toPose?: Pose) => string | null
  /** Live edit (drags, typing) — call beginEdit() once before a gesture so
   *  the whole gesture is a single undo step. */
  updateAction: (trackId: string, actionId: string, patch: ActionPatch) => void
  beginEdit: () => void
  /** Live edit, like updateAction (call beginEdit first). */
  setInitPose: (trackId: string, pose: Pose) => void
  duplicateAction: (trackId: string, actionId: string) => void
  deleteAction: (trackId: string, actionId: string) => void
  /** "Record" a pose taken from the viewport for a piece (or `'camera'`):
   *  sets the end of the selected action if it belongs to that piece's
   *  track, otherwise creates an action at the playhead. */
  recordPose: (key: string, pose: Pose) => void
}

// ---------- export dialogs (execution lives in hooks, not the store) ----------
export interface ExportState {
  dlAsk: boolean
  dlFormat: 'glb' | 'obj' | 'stl'
  videoAsk: boolean
  videoFormat: 'webm' | 'zip'
  /** What an exported video shows behind the pieces. */
  videoBackground: VideoBackground
  /** The flat color used when `videoBackground` is 'color'. */
  videoColor: string
  exportBusy: boolean
  exportError: string | null
}

export interface ExportActions {
  openDownload: () => void
  closeDownload: () => void
  setDlFormat: (f: 'glb' | 'obj' | 'stl') => void
  openVideoAsk: () => void
  closeVideoAsk: () => void
  setVideoFormat: (f: 'webm' | 'zip') => void
  setVideoBackground: (background: VideoBackground) => void
  setVideoColor: (color: string) => void
  setExportBusy: (busy: boolean) => void
  setExportError: (err: string | null) => void
}

export type Set = (fn: (state: Draft<AppState>) => void) => void
export type Get = () => AppState

export type AppState = ProjectsState &
  ProjectsActions &
  NavigationState &
  NavigationActions &
  BoardState &
  BoardActions &
  WorldState &
  WorldActions &
  HistoryState &
  HistoryActions &
  AssemblyState &
  AssemblyActions &
  AnimationState &
  AnimationActions &
  ExportState &
  ExportActions
