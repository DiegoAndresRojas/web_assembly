// The full store shape, assembled from one interface per slice file. Kept
// in one place because every slice's actions are allowed to read/update
// any other slice's state (they're combined into a single Zustand store) —
// see store/index.ts.
import type { Draft } from 'immer'

import type { SnapMode } from '@/lib/three/surfaceSnap'
import type {
  Axis,
  KeypointLink,
  PickHit,
  Pose,
  Project,
  StageMember,
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

export interface ProjectsState {
  projects: Project[]
  confirm: DeleteConfirm | null
  colorEdit: ColorEdit | null
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
  hoverObserver: boolean
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
  panBy: (dx: number, dy: number) => void
  setPan: (x: number, y: number) => void
  dropMeshOnBoard: (meshId: string, x: number, y: number) => void
  dropStageOnBoard: (kind: 'assembly' | 'observer' | 'animation', x: number, y: number) => void
  moveNode: (nodeId: string, x: number, y: number) => void
  linkIfDropped: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  hoverNode: (nodeId: string | null) => void
  deleteNode: (nodeId: string) => void
  startLinking: (nodeId: string, x: number, y: number) => void
  updateLinking: (x: number, y: number) => void
  completeLinking: (x: number, y: number) => void
  cancelLinking: () => void
  selectEdge: (edgeId: string | null) => void
  deleteSelectedEdge: () => void
  setMeshFilter: (ext: string | null) => void
  setPaletteHover: (which: 'assembly' | 'observer' | 'animation' | null) => void
}

// ---------- world (assembly/observer/animate shared) ----------
export interface WorldState {
  worldSelId: string | null
  gizmoMode: 'translate' | 'rotate'
  hint: string
  opacityOpenId: string | null
}

export interface WorldActions {
  selectWorldObject: (nodeId: string | null) => void
  setGizmoMode: (mode: 'translate' | 'rotate') => void
  setHint: (hint: string) => void
  toggleMemberVisible: (nodeId: string) => void
  setMemberOpacity: (nodeId: string, value: number) => void
  toggleOpacityUI: (nodeId: string) => void
  removeMember: (nodeId: string) => void
  syncStageMembers: (stageId: string) => void
  observableStages: () => Array<{ id: string; label: string }>
  toggleObserve: (stageNodeId: string) => void
  removeObserved: (stageNodeId: string) => void
}

// ---------- assembly (keypoint linking) ----------
export interface StageSnapshot {
  members: StageMember[]
  links: KeypointLink[]
}

export interface AssemblyState {
  kpOn: boolean
  /** 'edges' = corners + edge midpoints, 'faces' = flat-face centers. */
  kpMode: SnapMode
  pendingPicks: PickHit[]
  kpEditing: string | null
  gapPending: { linkId: string; gap: number } | null
  canUndo: boolean
  canRedo: boolean
  history: StageSnapshot[]
  future: StageSnapshot[]
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
  undoLink: () => void
  redoLink: () => void
  openKpEdit: (linkId: string) => void
  closeKpEdit: () => void
  cancelKpEdit: () => void
  setKpRotAxis: (axis: Axis, value: number) => void
  doUnion: () => void
  undoUnion: () => void
}

// ---------- animation ----------
export interface PoseDraft {
  pos: Vec3
  rot: Vec3
}
export interface ActionDraft {
  fromPose: PoseDraft
  toPose: PoseDraft
  start: number
  duration: number
  toLinked: boolean
  editingSide: 'from' | 'to' | null
}
export interface ConfigTarget {
  trackId: string
  actionId: string | null
  isNew: boolean
  isInit: boolean
}

export interface AnimationState {
  playT: number
  playing: boolean
  cfgTarget: ConfigTarget | null
  cfgDraft: ActionDraft | null
}

export interface AnimationActions {
  onAnimPlay: () => void
  onAnimReset: () => void
  onObsPlay: () => void
  onObsReset: () => void
  seekTo: (t: number) => void
  addMeshTrack: (nodeId: string) => void
  addCameraTrack: (currentCameraPose?: PoseDraft) => void
  removeTrack: (trackId: string) => void
  confirmRemoveTrack: () => void
  onCamKill: () => void
  confirmCamDelete: () => void
  cancelCamDelete: () => void
  openInitEditor: (trackId: string) => void
  openNewAction: (trackId: string) => void
  openAction: (trackId: string, actionId: string) => void
  tlCancelConfig: () => void
  tlSaveConfig: () => void
  onCfgDelete: () => void
  setDraftStart: (v: number) => void
  setDraftDuration: (v: number) => void
  setDraftAxis: (side: 'from' | 'to', kind: 'pos' | 'rot', axis: Axis, value: number) => void
  setEditingSide: (side: 'from' | 'to' | null) => void
  setDraftPoseFromCamera: (side: 'from' | 'to', pose: PoseDraft) => void
  setDraftToLinked: (checked: boolean) => void
}

// ---------- export dialogs (execution lives in hooks, not the store) ----------
export interface ExportState {
  dlAsk: boolean
  dlFormat: 'glb' | 'obj' | 'stl'
  videoAsk: boolean
  videoFormat: 'webm' | 'zip'
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
  AssemblyState &
  AssemblyActions &
  AnimationState &
  AnimationActions &
  ExportState &
  ExportActions
