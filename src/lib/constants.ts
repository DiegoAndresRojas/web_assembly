export const STORAGE_KEY = 'meshstudio.v1'

// board canvas geometry (px, at zoom = 1)
export const MESH_W = 132
export const MESH_H = 132
export const NODE_W = 76
export const GRID_STEP = 22

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 0.15

// timeline
export const PX_PER_SECOND = 80
export const TRACK_ROW_H = 34

// world / keypoints
export const DEFAULT_MESH_COLOR = '#9a97ab'
export const KP_POINT_COLOR = '#968ae0'
export const KP_GAP_EPS = 0.02
export const MESH_EXTS = ['glb', 'gltf', 'obj', 'stl'] as const
