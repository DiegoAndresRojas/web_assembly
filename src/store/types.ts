// The full store shape, assembled from one interface per slice file. Kept
// in one place because every slice's actions are allowed to read/update
// any other slice's state (they're combined into a single Zustand store) —
// see store/index.ts.
import type { Draft } from 'immer'

import type { Rect } from '@/lib/frames'
import type { LightPreset, SceneBounds } from '@/lib/lights'
import type { SnapMode } from '@/lib/three/surfaceSnap'
import type { VideoBackground } from '@/lib/videoFormat'
import type {
  Axis,
  FrameFormat,
  KeypointLink,
  LightKind,
  PartOverride,
  PickHit,
  Pose,
  Project,
  StageCamera,
  StageEnvironment,
  StageFloor,
  StageLight,
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
  /** What is being done with files right now ("Importing bracket…"), for
   *  the person to see; null when nothing is. */
  working: string | null
}

export interface ProjectsActions {
  createProject: (name?: string) => Project
  renameProject: (pid: string, name: string) => void
  /** Adds an independent copy of a project (sharing its mesh files). */
  duplicateProject: (pid: string) => void
  askDeleteProject: (id: string, name: string) => void
  cancelDeleteConfirm: () => void
  confirmDelete: () => void
  /** Stores the files and adds them to the project's library; the ones
   *  that are not meshes, or cannot be stored, are told about on screen.
   *  Resolves with the ids of the library meshes that were added. */
  importMeshFiles: (pid: string, files: File[]) => Promise<string[]>
  /** Downloads the project as one file, mesh files included. */
  exportProject: (pid: string) => Promise<void>
  /** Adds the project held in a project file. */
  importProject: (file: Blob) => Promise<void>
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
/** Where the working (orbit) camera was looking from. */
export interface OrbitView {
  pos: [number, number, number]
  target: [number, number, number]
}

/** How a stage's view was left, so coming back to it finds it the same. */
export interface StageView {
  /** Assembly inputs whose lock was open. */
  asmOpen: string[]
  worldSelId: string | null
  playT: number
  selection: TimelineSelection | null
  /** Null until the user has moved the view themselves. */
  orbit: OrbitView | null
}

export interface NavigationState {
  /** 'viewer': a presentation played, one animation after another. */
  view: 'projects' | 'board' | 'world' | 'viewer'
  /** Where closing the viewer goes back to. */
  viewerFrom: 'projects' | 'board'
  /** The board frame the viewer plays (null: whatever the project has —
   *  see lib/frames.ts playlistOf). */
  viewerFrame: string | null
  pid: string | null
  aid: string | null
  wmode: WorldMode
  /** By stage node id. Saved with the projects. */
  stageViews: Record<string, StageView>
}

export interface NavigationActions {
  openProject: (id: string) => void
  backToProjects: () => void
  openStage: (nodeId: string) => void
  backToBoard: () => void
  /** Plays a presentation from its first animation — the given frame's,
   *  or the project's first (says so when there is nothing to play). */
  openViewer: (pid: string, from: 'projects' | 'board', frameId?: string) => void
  /** Shows an animation in the viewer and plays it. */
  viewScene: (stageId: string) => void
  closeViewer: () => void
  /** Keeps where the working camera was when a stage's 3D view closes. */
  rememberOrbit: (stageId: string, orbit: OrbitView | null) => void
}

// ---------- board ----------
export interface LinkingDraft {
  from: string
  x: number
  y: number
}

export type BoardTool = 'select' | 'pan' | 'frame'

export interface BoardState {
  pan: { x: number; y: number }
  zoom: number
  /** 'frame': drag out a presentation frame. */
  tool: BoardTool
  ctrlDown: boolean
  hover: string | null
  selId: string | null
  selEdge: string | null
  selFrame: string | null
  linking: LinkingDraft | null
  meshFilterExt: string | null
  /** The board was just opened: it is still to be fitted to the view. */
  boardFit: boolean
  /** The palette token under the pointer (its name shows). */
  paletteHover: PaletteKind | null
}

export type PaletteKind = 'assembly' | 'animation' | 'frame'

export interface BoardActions {
  effectiveTool: () => BoardTool
  setTool: (mode: BoardTool) => void
  setCtrlDown: (down: boolean) => void
  zoomBy: (delta: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  /** Zooms keeping the board point under (x, y) — in px from the board's
   *  top-left corner — where it is. */
  zoomAt: (delta: number, x: number, y: number) => void
  /** Brings every node into a view of the given size. */
  fitBoard: (width: number, height: number) => void
  setPan: (x: number, y: number) => void
  dropMeshOnBoard: (meshId: string, x: number, y: number) => void
  dropStageOnBoard: (kind: 'assembly' | 'animation', x: number, y: number) => void
  moveNode: (nodeId: string, x: number, y: number) => void
  linkIfDropped: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  hoverNode: (nodeId: string | null) => void
  /** Names a stage node (what its row, breadcrumb and imports show). */
  renameNode: (nodeId: string, label: string) => void
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
  setPaletteHover: (which: PaletteKind | null) => void
  /** Adds a presentation frame of the given rectangle and selects it. */
  addFrame: (rect: Rect) => void
  selectFrame: (frameId: string | null) => void
  /** Puts a frame's corner at (x, y), taking along the nodes inside it. */
  moveFrame: (frameId: string, x: number, y: number) => void
  resizeFrame: (frameId: string, rect: Rect) => void
  renameFrame: (frameId: string, label: string) => void
  deleteFrame: (frameId: string) => void
}

// ---------- board history (undo/redo on the board) ----------
export interface BoardHistoryState {
  canBoardUndo: boolean
  canBoardRedo: boolean
}

export interface BoardHistoryActions {
  /** Makes the board as it is now something to come back to — for edits
   *  made in many small changes (dragging a node). */
  pushBoardHistory: () => void
  boardUndo: () => void
  boardRedo: () => void
  clearBoardHistory: () => void
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
  partOverrides: Record<string, PartOverride>
  startPoses: Record<string, Pose>
  lights: StageLight[]
  environment: StageEnvironment | null
  floor: StageFloor | null
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
  /** Assembly inputs whose lock was opened: their pieces are listed. */
  asmOpen: string[]
  gapPending: { linkId: string; gap: number } | null
}

export interface AssemblyActions {
  toggleKp: (on: boolean) => void
  setKpMode: (mode: SnapMode) => void
  pickPoint: (hit: PickHit) => void
  /** Persists a pose edited directly in the viewport (gizmo), as an
   *  undoable step — of a stage input or a released piece; whatever is
   *  linked to it moves along. */
  setMemberPose: (nodeId: string, pose: Pose) => void
  /** Shows / hides the pieces of an assembly input in the panel (its lock). */
  toggleAsmOpen: (asmId: string) => void
  /** Releases a piece (by part key) from its assembly input, or locks a
   *  released one back in where it is now. */
  togglePartLock: (key: string) => void
  /** Puts a piece back exactly as its assembly had it. */
  restorePart: (key: string) => void
  removeLink: (linkId: string) => void
  acceptGap: () => void
  rejectGap: () => void
  openKpEdit: (linkId: string) => void
  closeKpEdit: () => void
  cancelKpEdit: () => void
  setKpRotAxis: (axis: Axis, value: number) => void
}

// ---------- animation ----------
/** What the timeline inspector is showing: one action, or a track's
 *  initial pose (`'init'`). */
export interface TimelineSelection {
  trackId: string
  actionId: string | 'init'
}

export type ActionPatch = Partial<
  Pick<
    TimelineAction,
    | 'start'
    | 'duration'
    | 'ease'
    | 'fromLinked'
    | 'toLinked'
    | 'fromPose'
    | 'toPose'
    | 'toIntensity'
  >
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
  setCameraName: (name: string) => void
  /** Starts the open animation's camera from the pose another
   *  animation's camera has when that animation starts or ends (creating
   *  the camera here if there is none yet). */
  importCamera: (fromStageId: string, at: 'start' | 'end') => void
  /** Starts the open animation's pieces where another animation has them
   *  when it starts or ends — every piece the two share, or only `only`
   *  and what is inside it. `fromStageId` null puts them back where their
   *  assembly has them. Tracks of those pieces start there too. */
  importStartPoses: (fromStageId: string | null, at: 'start' | 'end', only: string | null) => void
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
  /** Whether a track starts where its piece already is (its assembly, or
   *  the last animation earlier in the chain) rather than at a set pose. */
  setInitLinked: (trackId: string, linked: boolean) => void
  duplicateAction: (trackId: string, actionId: string) => void
  deleteAction: (trackId: string, actionId: string) => void
  /** "Record" a pose taken from the viewport for a piece (or `'camera'`):
   *  sets the end of the selected action if it belongs to that piece's
   *  track, otherwise creates an action at the playhead. */
  recordPose: (key: string, pose: Pose) => void
}

// ---------- lighting (of the open animation stage) ----------
export type LightPatch = Partial<Omit<StageLight, 'id' | 'kind'>>

export interface LightsActions {
  /** Adds a light around the pieces (`bounds`: where they are), aimed at
   *  them, and selects it. A stage's first light comes with an ambient fill. */
  addLight: (kind: LightKind, bounds: SceneBounds) => void
  /** Replaces the stage's lights with a ready-made set around the pieces. */
  applyLightPreset: (preset: LightPreset, bounds: SceneBounds) => void
  /** Removes every light: back to the default lighting. */
  clearLights: () => void
  /** Live edit — call beginEdit() once before a gesture. */
  updateLight: (id: string, patch: LightPatch) => void
  /** Moves a light, as one undoable step (a gizmo drag). */
  setLightPose: (id: string, pose: Pose) => void
  /** Turns a light, where it is, to shine at `target`. */
  aimLight: (id: string, target: Vec3) => void
  duplicateLight: (id: string) => void
  removeLight: (id: string) => void
  /** Puts a light on the timeline, to move it or change its intensity. */
  addLightTrack: (id: string) => void
  /** Takes the lighting of an animation earlier in the chain, as that one
   *  ends: in place of this stage's own, or added to it. */
  importLights: (fromStageId: string, mode: 'replace' | 'add') => void
  /** Live edits — call beginEdit() once before a gesture. Null removes it. */
  setEnvironment: (environment: StageEnvironment | null) => void
  setFloor: (floor: StageFloor | null) => void
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

export interface Notice {
  id: string
  kind: 'error' | 'info'
  text: string
}

export interface NoticesState {
  notices: Notice[]
}

export interface NoticesActions {
  /** Tells the person something on screen ('error' unless said otherwise). */
  notify: (text: string, kind?: Notice['kind']) => void
  dismissNotice: (id: string) => void
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
  LightsActions &
  ExportState &
  ExportActions &
  NoticesState &
  NoticesActions &
  BoardHistoryState &
  BoardHistoryActions
