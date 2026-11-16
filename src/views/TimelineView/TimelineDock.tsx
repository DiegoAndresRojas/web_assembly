import { useEffect, useRef, type DragEvent, type PointerEvent, type RefObject } from 'react'

import { ticks as buildTicks, stageDuration } from '@/lib/timeline'
import type { WorldSession } from '@/lib/three/worldSession'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'
import { ActionInspector } from './ActionInspector'
import { HEADER_W, TrackHeader, TrackLane } from './TrackLane'
import { timelineRows } from './timelineRows'
import { TransportBar } from './TransportBar'

/** The playhead line across the tracks — its own component, since playT
 *  changes every frame during playback and only this needs to follow it
 *  (plus keeping it in view while playing). */
function Playhead({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const playT = useStore((s) => s.playT)
  const playing = useStore((s) => s.playing)
  const px = useStore((s) => s.pxPerSecond)
  const x = HEADER_W + playT * px

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER_W) {
      el.scrollLeft = Math.max(0, x - HEADER_W - 40)
    }
  }, [x, playing, scrollRef])

  return <div className="tl-playhead" style={{ left: x }} />
}

/** The playhead's marker on the ruler. */
function PlayheadCap() {
  const playT = useStore((s) => s.playT)
  const px = useStore((s) => s.pxPerSecond)
  return (
    <div
      style={{
        position: 'absolute',
        left: playT * px - 5,
        bottom: 0,
        width: 0,
        height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: '7px solid var(--color-accent)',
        pointerEvents: 'none',
      }}
    />
  )
}

export interface TimelineDockProps {
  project: Project
  stageId: string
  stage: Stage
  session: WorldSession | null
}

/** The animation timeline: transport, ruler, one row per track (headers
 *  stick to the left, the ruler to the top, both scroll with the lanes)
 *  and the inspector for whatever is selected. Resizable from its top
 *  edge; Ctrl + wheel zooms around the cursor. */
export function TimelineDock({ project, stageId, stage, session }: TimelineDockProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dockHeight = useStore((s) => s.dockHeight)
  const px = useStore((s) => s.pxPerSecond)
  const worldSelId = useStore((s) => s.worldSelId)
  const selection = useStore((s) => s.selection)
  const seekTo = useStore((s) => s.seekTo)
  const setDockHeight = useStore((s) => s.setDockHeight)
  const addMeshTrack = useStore((s) => s.addMeshTrack)

  const rows = timelineRows(project, stageId, stage)
  const dur = stageDuration(stage)
  // room past the last action to drag things further out
  const laneSeconds = Math.max(dur + 2, 6)
  const laneWidth = laneSeconds * px
  const ticks = buildTicks(laneSeconds, px)

  // Ctrl + wheel zoom, keeping the time under the cursor in place (a
  // native non-passive listener: React's onWheel can't preventDefault)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const s = useStore.getState()
      const x = e.clientX - el.getBoundingClientRect().left
      const t = (x + el.scrollLeft - HEADER_W) / s.pxPerSecond
      s.setZoom(s.pxPerSecond * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
      const next = useStore.getState().pxPerSecond
      el.scrollLeft = Math.max(0, t * next + HEADER_W - x)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const resize = useRef<{ y0: number; h0: number } | null>(null)
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    resize.current = { y0: e.clientY, h0: dockHeight }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = resize.current
    if (r) setDockHeight(r.h0 - (e.clientY - r.y0))
  }

  const scrubbing = useRef(false)
  const scrubTo = (clientX: number, el: HTMLElement) =>
    seekTo((clientX - el.getBoundingClientRect().left) / px)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const nodeId = e.dataTransfer.getData('text/ms-node-id')
    if (nodeId) addMeshTrack(nodeId)
  }

  return (
    <div
      className="tl-dock"
      style={{ height: dockHeight }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        className="tl-resize"
        title="Drag to resize"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={() => (resize.current = null)}
      />
      <TransportBar stage={stage} session={session} />
      <div className="tl-body">
        <div className="tl-scroll" ref={scrollRef}>
          <div style={{ position: 'relative', width: HEADER_W + laneWidth, minHeight: '100%' }}>
            <div className="tl-ruler-row">
              <div
                className="tl-corner text-muted"
                style={{
                  width: HEADER_W,
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                }}
              >
                {rows.length} {rows.length === 1 ? 'track' : 'tracks'}
              </div>
              <div
                className="tl-ruler"
                style={{ width: laneWidth }}
                onPointerDown={(e) => {
                  scrubbing.current = true
                  e.currentTarget.setPointerCapture(e.pointerId)
                  scrubTo(e.clientX, e.currentTarget)
                }}
                onPointerMove={(e) => {
                  if (scrubbing.current) scrubTo(e.clientX, e.currentTarget)
                }}
                onPointerUp={() => (scrubbing.current = false)}
              >
                {ticks.map((tick) => (
                  <div
                    key={tick.t}
                    style={{
                      position: 'absolute',
                      left: tick.x,
                      bottom: 0,
                      width: 1,
                      height: tick.label ? 8 : 4,
                      background: 'var(--color-neutral-700)',
                      pointerEvents: 'none',
                    }}
                  >
                    {tick.label && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 3,
                          bottom: 7,
                          fontSize: 9,
                          color: 'var(--color-neutral-500)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tick.label}
                      </span>
                    )}
                  </div>
                ))}
                <PlayheadCap />
              </div>
            </div>

            {rows.map((row) => {
              const active =
                (row.key ?? ANIM_CAMERA_KEY) === worldSelId || selection?.trackId === row.track.id
              return (
                <div key={row.track.id} className={'tl-row' + (active ? ' tl-row--active' : '')}>
                  <TrackHeader row={row} active={active} />
                  <TrackLane track={row.track} width={laneWidth} />
                </div>
              )
            })}
            {rows.length === 0 && (
              <div
                className="text-muted"
                style={{
                  position: 'sticky',
                  left: 0,
                  width: 'min(100%, 520px)',
                  padding: 'var(--space-4)',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                No tracks yet — move a piece and press <b>K</b>, or use its <b>+</b> in the scene
                list.
              </div>
            )}

            <Playhead scrollRef={scrollRef} />
          </div>
        </div>
        <ActionInspector project={project} stageId={stageId} stage={stage} session={session} />
      </div>
    </div>
  )
}
