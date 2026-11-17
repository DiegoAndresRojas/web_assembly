// The open project's sequence of steps (lib/steps.ts). Every edit is a
// board edit: undoable with the board's own history.
import { addStep, moveStep, stagesWithoutStep } from '@/lib/steps'
import { recordBoardEdit } from './boardHistorySlice'
import { findProject } from './helpers'
import type { Get, Set, StepsActions } from './types'

export function createStepsSlice(set: Set, get: Get): StepsActions {
  const edit = (run: () => void) => recordBoardEdit(get, set, run)

  return {
    addStep(stageId) {
      edit(() =>
        set((state) => {
          const project = findProject(state, state.pid)
          if (project) addStep(project, stageId)
        }),
      )
    },

    addEveryStep() {
      edit(() =>
        set((state) => {
          const project = findProject(state, state.pid)
          if (!project) return
          for (const node of stagesWithoutStep(project)) addStep(project, node.id)
        }),
      )
    },

    removeStep(stepId) {
      edit(() =>
        set((state) => {
          const project = findProject(state, state.pid)
          if (project) project.steps = project.steps.filter((s) => s.id !== stepId)
        }),
      )
    },

    moveStep(stepId, by) {
      edit(() =>
        set((state) => {
          const project = findProject(state, state.pid)
          if (project) moveStep(project, stepId, by)
        }),
      )
    },

    updateStep(stepId, patch) {
      edit(() =>
        set((state) => {
          const step = findProject(state, state.pid)?.steps.find((s) => s.id === stepId)
          if (!step) return
          const title = patch.title?.trim()
          if (title && title !== step.title) step.title = title
          if (patch.instructions !== undefined && patch.instructions !== step.instructions) {
            step.instructions = patch.instructions
          }
        }),
      )
    },
  }
}
