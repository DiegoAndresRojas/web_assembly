import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { FrameIcon, MoveIcon, SelectIcon, UndoIcon } from '@/components/icons'
import { useStore } from '@/store'

function ZoomOutIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 256 256" fill="currentColor">
      <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z" />
    </svg>
  )
}
function ZoomInIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 256 256" fill="currentColor">
      <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
    </svg>
  )
}

export function BoardToolSwitcher() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const canUndo = useStore((s) => s.canBoardUndo)
  const canRedo = useStore((s) => s.canBoardRedo)
  const undo = useStore((s) => s.boardUndo)
  const redo = useStore((s) => s.boardRedo)
  return (
    <div
      style={{
        position: 'absolute',
        right: 'var(--space-4)',
        top: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 4,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <IconButton
        size="md"
        active={tool === 'select'}
        title="Select"
        onClick={() => setTool('select')}
      >
        <SelectIcon size={17} />
      </IconButton>
      <IconButton size="md" active={tool === 'pan'} title="Pan" onClick={() => setTool('pan')}>
        <MoveIcon size={17} />
      </IconButton>
      <IconButton
        size="md"
        active={tool === 'frame'}
        title="Presentation: drag a rectangle around the animations to play"
        onClick={() => setTool(tool === 'frame' ? 'select' : 'frame')}
      >
        <FrameIcon size={17} />
      </IconButton>
      <div style={{ height: 1, margin: '2px 3px', background: 'var(--color-divider)' }} />
      <IconButton size="md" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <UndoIcon size={16} />
      </IconButton>
      <IconButton size="md" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        <UndoIcon size={16} style={{ transform: 'scaleX(-1)' }} />
      </IconButton>
    </div>
  )
}

export function BoardZoomControls({ onFit }: { onFit: () => void }) {
  const zoomIn = useStore((s) => s.zoomIn)
  const zoomOut = useStore((s) => s.zoomOut)
  const zoom = useStore((s) => s.zoom)
  return (
    <div
      style={{
        position: 'absolute',
        right: 'var(--space-4)',
        bottom: 'var(--space-4)',
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'center',
      }}
    >
      <span className="text-muted" style={{ fontSize: 11, minWidth: 34, textAlign: 'right' }}>
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="secondary" icon title="Zoom out" onClick={zoomOut}>
        <ZoomOutIcon />
      </Button>
      <Button variant="secondary" icon title="Zoom in" onClick={zoomIn}>
        <ZoomInIcon />
      </Button>
      <Button variant="secondary" title="Bring the whole board into view" onClick={onFit}>
        Fit
      </Button>
    </div>
  )
}
