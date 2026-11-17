import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { STORAGE_KEY } from '@/lib/constants'
import { CURRENT_VERSION, runMigrations } from '@/lib/migrations'
import { createAnimationSlice, initialAnimationState } from './animationSlice'
import { createAssemblySlice, initialAssemblyState } from './assemblySlice'
import { createBoardHistorySlice, initialBoardHistoryState } from './boardHistorySlice'
import { createBoardSlice, initialBoardState } from './boardSlice'
import { createExportSlice, initialExportState } from './exportSlice'
import { createHistorySlice, initialHistoryState } from './historySlice'
import { createLightsSlice } from './lightsSlice'
import { createNoticesSlice, initialNoticesState } from './noticesSlice'
import { createNavigationSlice, initialNavigationState } from './navigationSlice'
import { createProjectStorage } from './persistStorage'
import { createStepsSlice } from './stepsSlice'
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
      ...initialNoticesState,
      ...initialBoardHistoryState,

      ...createProjectsSlice(set, get),
      ...createNavigationSlice(set, get),
      ...createBoardSlice(set, get),
      ...createWorldSlice(set),
      ...createHistorySlice(set, get),
      ...createAssemblySlice(set, get),
      ...createAnimationSlice(set, get),
      ...createLightsSlice(set, get),
      ...createExportSlice(set),
      ...createNoticesSlice(set),
      ...createBoardHistorySlice(set, get),
      ...createStepsSlice(set, get),
    })),
    {
      name: STORAGE_KEY,
      version: CURRENT_VERSION,
      storage: createProjectStorage(() =>
        useStore
          .getState()
          .notify(
            'Your last changes could not be saved: the browser storage is full or unavailable. Export the project to keep a copy.',
          ),
      ),
      partialize: (state) => ({ projects: state.projects, stageViews: state.stageViews }),
      migrate: (persisted) => runMigrations(persisted),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AppState>) }),
    },
  ),
)

export { COLOR_PRESETS } from './projectsSlice'
