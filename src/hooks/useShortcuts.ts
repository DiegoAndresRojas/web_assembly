// Keyboard shortcuts for the open stage (mounted by WorldView). Ignored
// while typing in a field.
//
//   Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y)   undo / redo
//   Space                            play / pause (observer: play, pause, continue)
//   ← / →                            observer chain: previous / next step
//   Home                             playhead to 0
//   Delete / Backspace               delete the selected action
//   Ctrl+D                           duplicate the selected action
//   Esc                              select the parent piece / clear selection
//   K                                record the viewport pose into an action
import { useEffect } from 'react'

import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { readPose } from '@/lib/three/buildMesh'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'

/** Records what the viewport shows into the animation, as the end of an
 *  action at the playhead (or of the selected action): the selected piece
 *  where the gizmo left it — or the animation camera object, when it (or
 *  its track) is what's selected. Returns whether anything was recorded. */
export function recordFromViewport(session: WorldSession | null): boolean {
  const state = useStore.getState()
  if (!session || state.wmode !== 'animate') return false
  const camTrackSelected = selectCurrentProject(state)?.stages[state.aid ?? '']?.tracks.some(
    (t) => t.targetKind === 'camera' && t.id === state.selection?.trackId,
  )
  const key = state.worldSelId ?? (camTrackSelected ? ANIM_CAMERA_KEY : null)
  if (!key) return false
  const obj = session.getObject(key)
  if (!obj) return false
  state.recordPose(key, readPose(obj))
  return true
}

/** Records the view the user is looking from as the animation camera's
 *  pose — "shoot from here". */
export function recordCameraFromView(session: WorldSession | null): void {
  const state = useStore.getState()
  if (!session || state.wmode !== 'animate') return
  state.recordPose(ANIM_CAMERA_KEY, session.getCameraPose())
  state.selectWorldObject(ANIM_CAMERA_KEY)
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useShortcuts(session: WorldSession | null): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = useStore.getState()
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (ctrl && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (ctrl && key === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (e.key === 'Escape') {
        if (s.worldSelId) s.selectParentPiece()
        else s.selectAction(null)
        return
      }

      if (s.wmode === 'observer' && e.key === ' ') {
        e.preventDefault()
        if (s.obsPhase === 'playing' || s.obsPhase === 'returning') s.obsPause()
        else if (s.obsPhase === 'paused' && !s.worldAltered) s.obsContinue()
        else s.obsPlay()
        return
      }
      // observer chains: previous / next step
      if (s.wmode === 'observer' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') s.obsPrev()
        else s.obsNext()
        return
      }
      if (s.wmode !== 'animate') return

      const sel = s.selection && s.selection.actionId !== 'init' ? s.selection : null
      if (e.key === ' ') {
        e.preventDefault()
        s.onAnimPlay()
      } else if (e.key === 'Home') {
        e.preventDefault()
        s.seekTo(0)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        s.deleteAction(sel.trackId, sel.actionId)
      } else if (ctrl && key === 'd' && sel) {
        e.preventDefault()
        s.duplicateAction(sel.trackId, sel.actionId)
      } else if (!ctrl && key === 'k') {
        if (recordFromViewport(session)) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session])
}
