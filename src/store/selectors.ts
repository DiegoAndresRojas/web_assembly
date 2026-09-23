// Small read-only selectors shared by view components. Plain functions
// (not hooks) so they can be used both inside `useStore(selectCurrentProject)`
// and inside other hooks/effects via `selectCurrentProject(useStore.getState())`.
import { normalizeStage } from '@/lib/migrations'
import type { AppState } from './types'
import type { Project, Stage } from '@/types/project'

export function selectCurrentProject(state: AppState): Project | null {
  return state.projects.find((p) => p.id === state.pid) ?? null
}

export function selectStage(project: Project | null, stageId: string | null): Stage | null {
  if (!project || !stageId) return null
  return project.stages[stageId] ?? normalizeStage({ kind: 'assembly' })
}

export function selectCurrentStage(state: AppState): Stage | null {
  return selectStage(selectCurrentProject(state), state.aid)
}
