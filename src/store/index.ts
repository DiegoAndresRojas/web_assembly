import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { STORAGE_KEY } from '@/lib/constants'
import { CURRENT_VERSION, runMigrations } from '@/lib/migrations'
import { createAnimationSlice, initialAnimationState } from './animationSlice'
import { createAssemblySlice, initialAssemblyState } from './assemblySlice'
import { createBoardSlice, initialBoardState } from './boardSlice'
import { createExportSlice, initialExportState } from './exportSlice'
import { createNavigationSlice, initialNavigationState } from './navigationSlice'
import { createProjectsSlice, initialProjectsState } from './projectsSlice'
import type { AppState } from './types'
import { createWorldSlice, initialWorldState } from './worldSlice'

// localStorage can throw (quota exceeded — large uploaded meshes add up
// fast as base64 — or private-browsing mode blocking storage entirely).
// zustand's persist middleware doesn't guard against that itself, and an
// uncaught throw there would otherwise look like "nothing saved, no
// error" from the UI's perspective. Surface it instead of losing writes
// silently.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name)
    } catch (e) {
      console.error('[mesh-studio] could not read saved projects:', e)
      return null
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value)
    } catch (e) {
      console.error(
        '[mesh-studio] could not save projects — storage may be full or unavailable (private browsing?):',
        e,
      )
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name)
    } catch (e) {
      console.error('[mesh-studio] could not clear saved projects:', e)
    }
  },
}

export const useStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      ...initialProjectsState,
      ...initialNavigationState,
      ...initialBoardState,
      ...initialWorldState,
      ...initialAssemblyState,
      ...initialAnimationState,
      ...initialExportState,

      ...createProjectsSlice(set, get),
      ...createNavigationSlice(set, get),
      ...createBoardSlice(set, get),
      ...createWorldSlice(set, get),
      ...createAssemblySlice(set, get),
      ...createAnimationSlice(set, get),
      ...createExportSlice(set),
    })),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ projects: state.projects }),
      migrate: (persisted) => runMigrations(persisted),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AppState>) }),
    },
  ),
)

export { COLOR_PRESETS } from './projectsSlice'
