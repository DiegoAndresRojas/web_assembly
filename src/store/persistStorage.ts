// localStorage adapter for zustand's persist middleware.
//
// persist calls setItem after *every* state change — each playback frame,
// each pointermove of a timeline drag, each hover — and only `projects`
// is saved, which carries every uploaded mesh as base64 (easily megabytes).
// Serializing that on every change stalls the render loop. So:
//   - skip the write when `projects` is the same object as last time
//     (immer keeps untouched state by reference);
//   - batch bursts of edits (drags, typing) into one write at most every
//     WRITE_INTERVAL_MS, flushed early when the tab is hidden or closed.
//
// localStorage can also throw (quota exceeded, private browsing) — logged
// and handed to `onWriteError`, so the person is told rather than losing
// work silently.
import type { PersistStorage, StorageValue } from 'zustand/middleware'

const WRITE_INTERVAL_MS = 400

let readFailed = false

/** Whether the saved projects could be read when the app started (false:
 *  what is in memory may be less than what is saved). */
export function savedProjectsWereRead(): boolean {
  return !readFailed
}

export function createProjectStorage<S extends { projects: unknown; stageViews?: unknown }>(
  onWriteError?: (error: unknown) => void,
): PersistStorage<S> {
  let lastProjects: unknown = undefined
  let lastViews: unknown = undefined
  let pending: { name: string; value: StorageValue<S> } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (!pending) return
    const { name, value } = pending
    pending = null
    try {
      window.localStorage.setItem(name, JSON.stringify(value))
    } catch (e) {
      console.error(
        '[mesh-studio] could not save projects — storage may be full or unavailable (private browsing?):',
        e,
      )
      onWriteError?.(e)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem(name) {
      try {
        const raw = window.localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null
      } catch (e) {
        console.error('[mesh-studio] could not read saved projects:', e)
        readFailed = true
        return null
      }
    },
    setItem(name, value) {
      const { projects, stageViews } = value.state
      if (projects === lastProjects && stageViews === lastViews) return
      lastProjects = projects
      lastViews = stageViews
      pending = { name, value }
      if (timer === null) timer = setTimeout(flush, WRITE_INTERVAL_MS)
    },
    removeItem(name) {
      pending = null
      try {
        window.localStorage.removeItem(name)
      } catch (e) {
        console.error('[mesh-studio] could not clear saved projects:', e)
      }
    },
  }
}
