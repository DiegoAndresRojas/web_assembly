import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { MoveIcon, SelectIcon } from '@/components/icons'
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
    </div>
  )
}

export function BoardZoomControls() {
  const zoomIn = useStore((s) => s.zoomIn)
  const zoomOut = useStore((s) => s.zoomOut)
  const resetView = useStore((s) => s.resetView)
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
      <Button variant="secondary" icon onClick={zoomOut}>
        <ZoomOutIcon />
      </Button>
      <Button variant="secondary" icon onClick={zoomIn}>
        <ZoomInIcon />
      </Button>
      <Button variant="secondary" onClick={resetView}>
        Reset view
      </Button>
    </div>
  )
}
