import { lazy, Suspense, useEffect } from 'react'

import { useStore } from '@/store'
import { BoardView } from '@/views/BoardView/BoardView'
import { ProjectsView } from '@/views/ProjectsView/ProjectsView'

// three.js (~600kB) is only needed once a stage is opened — code-split it
// out of the initial bundle instead of loading it for the projects/board
// screens.
const WorldView = lazy(() =>
  import('@/views/WorldView/WorldView').then((m) => ({ default: m.WorldView })),
)

export function App() {
  const view = useStore((s) => s.view)
  const aid = useStore((s) => s.aid)
  const setCtrlDown = useStore((s) => s.setCtrlDown)
  const undoLink = useStore((s) => s.undoLink)
  const redoLink = useStore((s) => s.redoLink)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlDown(e.type === 'keydown')
    }
    const onUndoRedo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redoLink()
      else undoLink()
    }
    const onBlur = () => setCtrlDown(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('keydown', onUndoRedo)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('keydown', onUndoRedo)
      window.removeEventListener('blur', onBlur)
    }
  }, [setCtrlDown, undoLink, redoLink])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        overflow: 'hidden',
      }}
    >
      {view === 'projects' && <ProjectsView />}
      {view === 'board' && <BoardView />}
      {/* Keying by stage id forces a clean remount (and a fresh WorldSession)
          whenever the user switches to a different stage. */}
      {view === 'world' && aid && (
        <Suspense fallback={null}>
          <WorldView key={aid} stageId={aid} />
        </Suspense>
      )}
    </div>
  )
}
