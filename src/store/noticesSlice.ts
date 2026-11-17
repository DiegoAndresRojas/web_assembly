// Things the person has to be told that have no place of their own on
// screen: a file that could not be loaded or stored, a project imported.
import { uid } from '@/lib/utils'
import type { NoticesActions, NoticesState, Set } from './types'

export const initialNoticesState: NoticesState = {
  notices: [],
}

export function createNoticesSlice(set: Set): NoticesActions {
  return {
    notify(text, kind = 'error') {
      set((state) => {
        // said once: a failure that repeats doesn't pile up
        if (state.notices.some((n) => n.text === text)) return
        state.notices.push({ id: uid(), kind, text })
      })
    },
    dismissNotice(id) {
      set((state) => {
        state.notices = state.notices.filter((n) => n.id !== id)
      })
    },
  }
}
