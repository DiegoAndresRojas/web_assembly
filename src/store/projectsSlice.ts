import { triggerDownload } from '@/lib/download'
import { extOf, filesAreKept, MESH_EXTS, putFile } from '@/lib/meshFiles'
import { isTiny, recommendedFactor } from '@/lib/meshScale'
import { reconcileProject } from '@/lib/stageInputs'
import { packProject, projectFileName, unpackProject } from '@/lib/projectFile'
import { normalizeMesh, normalizeProject } from '@/lib/migrations'
import { recordBoardEdit } from './boardHistorySlice'
import { findProject } from './helpers'
import type { Get, ProjectsActions, ProjectsState, Set } from './types'
import { DEFAULT_MESH_COLOR } from '@/lib/constants'
import type { Vec3 } from '@/types/project'

const COLOR_PRESETS = ['#9a97ab', '#e07a5f', '#81b29a', '#f2cc8f', '#6a8fe0', '#c9a0dc']
export { COLOR_PRESETS }

export const initialProjectsState: ProjectsState = {
  projects: [],
  confirm: null,
  colorEdit: null,
  scaleEdit: null,
  working: null,
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function createProjectsSlice(set: Set, get: Get): ProjectsActions {
  const actions: ProjectsActions = {
    createProject(name) {
      const project = normalizeProject({ name: name ?? 'Project' })!
      set((state) => {
        state.projects.push(project)
      })
      return project
    },

    renameProject(pid, name) {
      set((state) => {
        const p = findProject(state, pid)
        if (p) p.name = name
      })
    },

    askDeleteProject(id, name) {
      set((state) => {
        state.confirm = { kind: 'project', id, label: name }
      })
    },

    cancelDeleteConfirm() {
      set((state) => {
        state.confirm = null
      })
    },

    confirmDelete() {
      const confirm = get().confirm
      if (!confirm) return
      if (confirm.kind === 'project') {
        set((state) => {
          state.projects = state.projects.filter((p) => p.id !== confirm.id)
          state.confirm = null
          state.view = 'projects'
          state.pid = null
        })
      } else if (confirm.kind === 'mesh') {
        set((state) => {
          const project = findProject(state, state.pid)
          if (!project) return
          project.meshes = project.meshes.filter((m) => m.id !== confirm.id)
          const nodeIds = project.board.nodes
            .filter((n) => n.kind === 'mesh' && n.meshId === confirm.id)
            .map((n) => n.id)
          project.board.nodes = project.board.nodes.filter(
            (n) => !(n.kind === 'mesh' && n.meshId === confirm.id),
          )
          project.board.edges = project.board.edges.filter(
            (e) => !nodeIds.includes(e.from) && !nodeIds.includes(e.to),
          )
          reconcileProject(project)
          state.confirm = null
        })
      }
    },

    askDeleteMesh(id, name) {
      set((state) => {
        state.confirm = { kind: 'mesh', id, label: name }
      })
    },

    async importMeshFiles(pid, files) {
      const { notify } = get()
      const setWorking = (working: string | null) =>
        set((state) => {
          state.working = working
        })
      let stored = 0
      for (const file of files) {
        const ext = extOf(file.name)
        if (!MESH_EXTS.includes(ext)) {
          notify(`${file.name} is not a mesh this app can load (GLB, GLTF, OBJ or STL).`)
          continue
        }
        setWorking(`Storing ${file.name}…`)
        try {
          const data = await file.arrayBuffer()
          const hash = await putFile(data)
          const mesh = normalizeMesh({ name: file.name, ext, hash, bytes: data.byteLength })
          set((state) => {
            const project = findProject(state, pid)
            if (project && mesh) project.meshes.push(mesh)
          })
          stored++
        } catch (e) {
          console.error('[mesh-studio] could not store', file.name, e)
          notify(
            `${file.name} could not be stored — the browser may be out of room. (${reason(e)})`,
          )
        }
      }
      setWorking(null)
      if (stored && !(await filesAreKept())) {
        notify(
          'This browser is not keeping files (private browsing?): the meshes will be gone when the page is reloaded.',
        )
      }
    },

    async exportProject(pid) {
      const project = get().projects.find((p) => p.id === pid)
      if (!project || get().working) return
      set((state) => {
        state.working = `Exporting ${project.name}…`
      })
      try {
        const { blob, missing } = await packProject(project)
        triggerDownload(blob, projectFileName(project))
        if (missing.length) {
          get().notify(
            `Exported without the files of: ${missing.join(', ')} (not in this browser).`,
          )
        }
      } catch (e) {
        console.error('[mesh-studio] could not export the project:', e)
        get().notify(`${project.name} could not be exported: ${reason(e)}.`)
      } finally {
        set((state) => {
          state.working = null
        })
      }
    },

    async importProject(file) {
      if (get().working) return
      set((state) => {
        state.working = 'Importing project…'
      })
      try {
        const { project, missing } = await unpackProject(file)
        const names = new Set(get().projects.map((p) => p.name))
        if (names.has(project.name)) {
          let n = 2
          while (names.has(`${project.name} (${n})`)) n++
          project.name = `${project.name} (${n})`
        }
        set((state) => {
          state.projects.push(project)
        })
        if (missing.length) {
          get().notify(`${project.name} came without the files of: ${missing.join(', ')}.`)
        } else get().notify(`${project.name} imported.`, 'info')
        if (!(await filesAreKept())) {
          get().notify(
            'This browser is not keeping files (private browsing?): the meshes will be gone when the page is reloaded.',
          )
        }
      } catch (e) {
        console.error('[mesh-studio] could not import the project:', e)
        get().notify(`Could not import: ${reason(e)}.`)
      } finally {
        set((state) => {
          state.working = null
        })
      }
    },

    openColorEditor(nodeId) {
      const state = get()
      const project = state.projects.find((p) => p.id === state.pid)
      const node = project?.board.nodes.find((n) => n.id === nodeId)
      set((s) => {
        s.colorEdit = { nodeId, value: node?.color ?? DEFAULT_MESH_COLOR }
      })
    },
    cancelColorEditor() {
      set((state) => {
        state.colorEdit = null
      })
    },
    setColorDraft(value) {
      set((state) => {
        if (state.colorEdit) state.colorEdit.value = value
      })
    },
    applyColorEditor() {
      const { colorEdit, pid } = get()
      if (!colorEdit) return
      set((state) => {
        const project = findProject(state, pid)
        const node = project?.board.nodes.find((n) => n.id === colorEdit.nodeId)
        if (node) node.color = colorEdit.value
        state.colorEdit = null
      })
    },

    async openScaleEditor(nodeId, prompted = false) {
      const size = await ensureMeshSize(get, set, nodeId)
      const node = currentNode(get, nodeId)
      if (!size || !node) return
      // an automatic prompt only for pieces that are actually tiny
      if (prompted && !isTiny(size)) return
      set((s) => {
        s.scaleEdit = {
          nodeId,
          size,
          factor: prompted ? recommendedFactor(size) : node.scale,
          prompted,
        }
      })
    },
    setScaleDraft(factor) {
      set((state) => {
        if (state.scaleEdit && factor > 0) state.scaleEdit.factor = factor
      })
    },
    cancelScaleEditor() {
      set((state) => {
        state.scaleEdit = null
      })
    },
    applyScaleEditor() {
      const { scaleEdit, pid } = get()
      if (!scaleEdit) return
      set((state) => {
        const node = findProject(state, pid)?.board.nodes.find((n) => n.id === scaleEdit.nodeId)
        if (node) node.scale = scaleEdit.factor
        state.scaleEdit = null
      })
    },
  }

  /** The same action, undoable with the board's history. */
  const recorded =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A) =>
      recordBoardEdit(get, set, () => action(...args))

  return {
    ...actions,
    // (deleting a mesh from the library; deleting a project leaves nothing
    // open to undo on)
    confirmDelete: recorded(actions.confirmDelete),
    applyColorEditor: recorded(actions.applyColorEditor),
    applyScaleEditor: recorded(actions.applyScaleEditor),
  }
}

function currentNode(get: Get, nodeId: string) {
  const s = get()
  return s.projects.find((p) => p.id === s.pid)?.board.nodes.find((n) => n.id === nodeId)
}

/** The node's file size in native units — measured once per file (three.js
 *  loads on demand, it's not part of the board's bundle) and cached on the
 *  library mesh. */
async function ensureMeshSize(get: Get, set: Set, nodeId: string): Promise<Vec3 | null> {
  const s = get()
  const project = s.projects.find((p) => p.id === s.pid)
  const node = project?.board.nodes.find((n) => n.id === nodeId)
  const mesh = node && project?.meshes.find((m) => m.id === node.meshId)
  if (!project || !mesh) return null
  if (mesh.size) return mesh.size
  try {
    const { measureMesh } = await import('@/lib/three/buildMesh')
    const size = await measureMesh(mesh)
    set((state) => {
      const m = findProject(state, project.id)?.meshes.find((x) => x.id === mesh.id)
      if (m) m.size = size
    })
    return size
  } catch (e) {
    console.error('[mesh-studio] could not measure mesh:', e)
    get().notify(`Could not read ${mesh.name}: ${reason(e)}.`)
    return null
  }
}
