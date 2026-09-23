import { useRef, type DragEvent, type PointerEvent } from 'react'

import { PX_PER_SECOND } from '@/lib/constants'
import { ticks as buildTicks, stageDuration } from '@/lib/timeline'
import type { WorldSession } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import type { Project, Stage } from '@/types/project'
import { ActionConfigEditor } from './ActionConfigEditor'
import { TrackActions, TrackLabel } from './TrackLane'

export interface TimelineDockProps {
  project: Project
  stage: Stage
  session: WorldSession | null
}

export function TimelineDock({ project, stage, session }: TimelineDockProps) {
  const laneRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const cfgTarget = useStore((s) => s.cfgTarget)
  const playT = useStore((s) => s.playT)
  const seekTo = useStore((s) => s.seekTo)
  const addMeshTrack = useStore((s) => s.addMeshTrack)

  const dur = Math.max(1, stageDuration(stage))
  const ticks = buildTicks(dur, PX_PER_SECOND)
  const laneWidth = Math.max(dur * PX_PER_SECOND + 60, 400)

  const scrubToClientX = (clientX: number) => {
    const rect = laneRef.current?.getBoundingClientRect()
    if (!rect) return
    seekTo((clientX - rect.left) / PX_PER_SECOND)
  }
  const onSeek = (e: PointerEvent) => {
    scrubbingRef.current = true
    scrubToClientX(e.clientX)
  }
  const onDragMove = (e: PointerEvent) => {
    if (scrubbingRef.current) scrubToClientX(e.clientX)
  }
  const onDragEnd = () => {
    scrubbingRef.current = false
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const nodeId = e.dataTransfer.getData('text/ms-node-id')
    if (nodeId) addMeshTrack(nodeId)
  }

  return (
    <div
      style={{
        flex: '0 0 33.3333%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface)',
        boxShadow: '0 -1px 0 var(--color-divider)',
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {cfgTarget ? (
        <ActionConfigEditor session={session} />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            overflow: 'hidden',
            padding: 'var(--space-2) 0',
          }}
        >
          <div
            style={{
              width: 168,
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'inset -1px 0 0 var(--color-divider)',
            }}
          >
            <div style={{ height: 22, flex: 'none' }} />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {stage.tracks.map((t) => (
                <TrackLabel key={t.id} project={project} track={t} />
              ))}
            </div>
          </div>

          <div
            style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }}
            onPointerDown={onSeek}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerLeave={onDragEnd}
          >
            <div ref={laneRef} style={{ position: 'relative', width: laneWidth }}>
              <div
                style={{
                  height: 22,
                  position: 'relative',
                  boxShadow: 'inset 0 -1px 0 var(--color-divider)',
                }}
              >
                {ticks.map((tick) => (
                  <div
                    key={tick.t}
                    style={{
                      position: 'absolute',
                      left: tick.x,
                      top: 0,
                      fontSize: 9,
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
              {stage.tracks.map((t) => (
                <TrackActions key={t.id} track={t} />
              ))}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: playT * PX_PER_SECOND,
                  width: 1,
                  background: 'var(--color-accent)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
