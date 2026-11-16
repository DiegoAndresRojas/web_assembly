// Small read-only selectors shared by view components. Plain functions
// (not hooks) so they can be used both inside `useStore(selectCurrentProject)`
// and inside other hooks/effects via `selectCurrentProject(useStore.getState())`.
import type { AppState } from './types'
import type { Project } from '@/types/project'

export function selectCurrentProject(state: AppState): Project | null {
  return state.projects.find((p) => p.id === state.pid) ?? null
}
