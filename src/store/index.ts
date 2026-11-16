import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { STORAGE_KEY } from '@/lib/constants'
import { CURRENT_VERSION, runMigrations } from '@/lib/migrations'
import { createAnimationSlice, initialAnimationState } from './animationSlice'
import { createAssemblySlice, initialAssemblyState } from './assemblySlice'
import { createBoardSlice, initialBoardState } from './boardSlice'
import { createExportSlice, initialExportState } from './exportSlice'
import { createHistorySlice, initialHistoryState } from './historySlice'
import { createNavigationSlice, initialNavigationState } from './navigationSlice'
import { createProjectStorage } from './persistStorage'
import { createProjectsSlice, initialProjectsState } from './projectsSlice'
import type { AppState } from './types'
import { createWorldSlice, initialWorldState } from './worldSlice'

export const useStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      ...initialProjectsState,
      ...initialNavigationState,
      ...initialBoardState,
      ...initialWorldState,
      ...initialHistoryState,
      ...initialAssemblyState,
      ...initialAnimationState,
      ...initialExportState,

      ...createProjectsSlice(set, get),
      ...createNavigationSlice(set, get),
      ...createBoardSlice(set, get),
      ...createWorldSlice(set),
      ...createHistorySlice(set, get),
      ...createAssemblySlice(set, get),
      ...createAnimationSlice(set, get),
      ...createExportSlice(set),
    })),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createProjectStorage(),
      partialize: (state) => ({ projects: state.projects }),
      migrate: (persisted) => runMigrations(persisted),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AppState>) }),
    },
  ),
)

export { COLOR_PRESETS } from './projectsSlice'
