import { normalizeMesh, normalizeProject } from '@/lib/migrations'
import { findProject } from './helpers'
import type { Get, ProjectsActions, ProjectsState, Set } from './types'
import { DEFAULT_MESH_COLOR } from '@/lib/constants'

const COLOR_PRESETS = ['#9a97ab', '#e07a5f', '#81b29a', '#f2cc8f', '#6a8fe0', '#c9a0dc']
export { COLOR_PRESETS }

export const initialProjectsState: ProjectsState = {
  projects: [],
  confirm: null,
  colorEdit: null,
}

export function createProjectsSlice(set: Set, get: Get): ProjectsActions {
  return {
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
          for (const stageId in project.stages) {
            const stage = project.stages[stageId]
            stage.members = stage.members.filter((m) => !nodeIds.includes(m.nodeId))
            stage.links = stage.links.filter(
              (l) => !nodeIds.includes(l.nodeA) && !nodeIds.includes(l.nodeB),
            )
            stage.tracks = stage.tracks.filter((t) => !t.nodeId || !nodeIds.includes(t.nodeId))
          }
          state.confirm = null
        })
      }
    },

    askDeleteMesh(id, name) {
      set((state) => {
        state.confirm = { kind: 'mesh', id, label: name }
      })
    },

    addMeshes(pid, files) {
      set((state) => {
        const project = findProject(state, pid)
        if (!project) return
        for (const f of files) {
          const mesh = normalizeMesh({ name: f.name, ext: f.ext, data: f.data, origin: 'original' })
          if (mesh) project.meshes.push(mesh)
        }
      })
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
  }
}
