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

/** How stale a project's "last changed" may get before it is refreshed. */
const TOUCH_EVERY_MS = 60 * 1000

// keeps each project's "last changed" up to date: a project that is
// changed gets the time — at most once a minute, not on every edit
useStore.subscribe((state, before) => {
  if (state.projects === before.projects) return
  const now = Date.now()
  const changed = state.projects
    .filter((p) => {
      const was = before.projects.find((q) => q.id === p.id)
      return !!was && was !== p && now - p.updatedAt > TOUCH_EVERY_MS
    })
    .map((p) => p.id)
  if (!changed.length) return
  useStore.setState((s) => {
    for (const p of s.projects) if (changed.includes(p.id)) p.updatedAt = now
  })
})

export { COLOR_PRESETS } from './projectsSlice'
