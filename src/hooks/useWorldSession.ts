// React glue between the store (pure data) and the imperative three.js
// WorldSession: mounts/unmounts the session on the viewport element,
// dispatches pointer picks (already snapped onto the mesh surface by the
// session when keypoint-picking is on), drives animation playback, and keeps every
// stage member's live pose/color/opacity/visibility in sync with the
// store whenever it changes.
//
// One WorldView (keyed by stage id, see App.tsx) owns exactly one
// WorldSession, so a module-level "current session" ref is enough for the
// stable onPick/onFrame callbacks to reach it without going stale.
import { useEffect, useState } from 'react'

import type { Object3D } from 'three'

import { isFreePart, linkedBodies } from '@/lib/assembly'
import { evalStageIn, stagePieces } from '@/lib/chain'
import { ANIM_CAMERA_KEY } from '@/lib/constants'
import {
  assemblyParts,
  inputLabel,
  lockedKey,
  membersOf,
  parentKey,
  PART_SEP,
  partLocalPose,
} from '@/lib/graph'
import { lightIdOf, lightsAt, lightTrack } from '@/lib/lights'
import { stageDuration } from '@/lib/timeline'
import { aspectOf } from '@/lib/videoFormat'
import { applyColor, applyOpacity, applyPose, keepParsedMeshes } from '@/lib/three/buildMesh'
import { buildInput } from '@/lib/three/stageInput'
import { WorldSession, type PickHit } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { AppState, OrbitView } from '@/store/types'
import type { MembersRow, Pose, Project, StageMember } from '@/types/project'

let currentSession: WorldSession | null = null

/** Where the viewer was looking from, carried from one step to the next
 *  (the steps of an assembly share one world). */
let viewerOrbit: OrbitView | null = null

/** Starts the viewer's next step from the default view. */
export function resetViewerOrbit(): void {
  viewerOrbit = null
}

function onPick(hit: PickHit | null): void {
  const state = useStore.getState()
  if (!hit) {
    state.selectWorldObject(null)
    return
  }
  if (state.wmode === 'assembly' && state.kpOn) {
    state.pickPoint(hit)
    return
  }
  // animating: a locked assembly is picked as one thing, whatever piece of
  // it was clicked (assembly stages already pick whole inputs)
  state.selectWorldObject(
    state.wmode === 'animate' && hit.nodeId !== ANIM_CAMERA_KEY
      ? lockedKey(hit.nodeId, state.asmOpen)
      : hit.nodeId,
  )
}

/** Gizmo drags only move the live object. Assembly writes the result back
 *  to the stage member (keypoint links solve against it). In animate mode
 *  a move is a preview until recorded into an action (recordPose) — except
 *  for a light that is not on the timeline: it simply is where it is put. */
function onObjectMoved(nodeId: string, pose: Pose): void {
  const state = useStore.getState()
  if (state.wmode === 'assembly') {
    state.setMemberPose(nodeId, pose)
    return
  }
  const lightId = lightIdOf(nodeId)
  const stage = selectCurrentProject(state)?.stages[state.aid ?? '']
  if (lightId && !lightTrack(stage, lightId)) state.setLightPose(lightId, pose)
}

/** Poses every piece of `stageId` for time `t`: tracked pieces where their
 *  actions put them, the rest where they start (see lib/chain.ts). Returns
 *  the animation camera's pose at `t`, if the stage animates one — callers
 *  decide whether the viewport camera follows it. */
export function applyStageAt(
  session: WorldSession,
  project: Project,
  stageId: string,
  t: number,
): Pose | null {
  const stage = project.stages[stageId]
  if (!stage) return null
  session.poseLights(lightsAt(stage, t))
  const evald = evalStageIn(project, stageId, t)
  for (const { key, start } of stagePieces(project, stageId)) {
    const obj = session.getObject(key)
    if (obj) applyPose(obj, evald.meshes[key] ?? start)
  }
  return evald.camera
}

/** Shows the open animation stage at time `t`: its pieces, and the
 *  animation camera — an object in the world of its own, never the
 *  working view (hidden while the stage animates no camera). */
function showAnimateFrame(session: WorldSession, t: number): void {
  const state = useStore.getState()
  const project = selectCurrentProject(state)
  if (!project || !state.aid) return
  session.setAnimCamera(applyStageAt(session, project, state.aid, t))
}

/** Visibility / opacity of the pieces inside a stage's assembly inputs
 *  (stage.partLooks). A piece's opacity is its own × everything above it,
 *  down from the assembly input's own member opacity. */
function applyPartLooks(session: WorldSession, project: Project, stageId: string): void {
  const stage = project.stages[stageId]
  if (!stage) return
  for (const row of membersOf(project, stageId)) {
    if (row.mesh) continue
    const member = stage.members.find((m) => m.nodeId === row.node.id)
    const opacityOf = new Map<string, number>([[row.node.id, member?.opacity ?? 1]])
    for (const part of assemblyParts(project, row.node.id)) {
      const look = stage.partLooks?.[part.key]
      const opacity = (opacityOf.get(parentKey(part.key) ?? '') ?? 1) * (look?.opacity ?? 1)
      opacityOf.set(part.key, opacity)
      // (the piece in the group, not the stage object a released one becomes)
      const obj = session.getNested(part.key)
      if (!obj) continue
      obj.visible = look?.visible ?? true
      if (stage.kind === 'assembly' && part.depth === 1) {
        // a released piece is shown by its own stage object (sceneEntries);
        // a piece locked somewhere else sits there, the rest as assembled
        if (isFreePart(stage, part.key)) obj.visible = false
        else applyPose(obj, partLocalPose(stage, row.node.id, part.node.id, part.pose))
      }
      // meshes take the product; nested assemblies just pass it down
      if (part.mesh) applyOpacity(obj, opacity)
    }
  }
}

/** Longest step a single frame may advance time by — after the tab was in
 *  the background (rAF paused), the animation resumes instead of jumping. */
const MAX_FRAME_S = 0.1

function onFrame(rawDt: number): void {
  const session = currentSession
  if (!session) return
  const dt = Math.min(rawDt, MAX_FRAME_S)
  const state = useStore.getState()
  if (state.wmode === 'animate') {
    if (state.playing) animateTick(session, dt)
    // paused, seeked or stopped: the next Play starts from the store's playT
    else animClock = null
  }
}

/** Animate playback's own clock while playing. The render loop is the
 *  source of truth; the store's playT only mirrors it for the UI (and is
 *  where playback resumes from). Null when not playing. */
let animClock: number | null = null

function animateTick(session: WorldSession, dt: number): void {
  const state = useStore.getState()
  const stage = selectCurrentProject(state)?.stages[state.aid ?? '']
  if (!stage) return
  const dur = stageDuration(stage)
  let t = (animClock ?? state.playT) + dt
  let playing = true
  if (t >= dur) {
    if (state.loop && dur > 0) t %= dur
    else {
      t = dur
      playing = false
    }
  }
  animClock = playing ? t : null
  showAnimateFrame(session, t)
  useStore.setState((s) => {
    s.playT = t
    s.playing = playing
  })
}

interface SceneEntry {
  key: string
  row: MembersRow
  member: StageMember
}

/** What should be on screen for `stageId` as objects of their own: its
 *  inputs and, in an assembly, the pieces released from assembly inputs
 *  (keyed by part key, posed in the stage's space). */
function sceneEntries(project: Project, stageId: string): SceneEntry[] {
  const stage = project.stages[stageId]
  if (!stage) return []
  const rows = membersOf(project, stageId)
  const entries: SceneEntry[] = rows.flatMap((row) => {
    const member = stage.members.find((m) => m.nodeId === row.node.id)
    return member ? [{ key: row.node.id, row, member }] : []
  })
  if (stage.kind !== 'assembly') return entries
  for (const [key, override] of Object.entries(stage.partOverrides)) {
    if (!override.free) continue
    const [asmId, pieceId, ...deeper] = key.split(PART_SEP)
    const asm = entries.find((e) => e.key === asmId && !e.row.mesh)
    const row = deeper.length ? null : membersOf(project, asmId).find((r) => r.node.id === pieceId)
    if (!asm || !row) continue
    entries.push({
      key,
      row,
      member: {
        nodeId: key,
        visible: asm.member.visible,
        opacity: asm.member.opacity,
        pose: override.pose,
      },
    })
  }
  return entries
}

function applyEntry(obj: Object3D, { row, member }: SceneEntry, withPose: boolean): void {
  if (withPose) applyPose(obj, member.pose)
  // an assembly input carries its pieces' scales inside it
  obj.scale.setScalar(row.mesh ? (row.node.scale ?? 1) : 1)
  applyColor(obj, row.node.color)
  applyOpacity(obj, member.opacity)
  obj.visible = member.visible
}

/** What moves rigidly with a dragged stage object: in an assembly,
 *  everything tied to it by keypoint links. */
function companionsOf(id: string): string[] {
  const state = useStore.getState()
  if (state.wmode !== 'assembly') return []
  const stage = selectCurrentProject(state)?.stages[state.aid ?? '']
  return stage ? linkedBodies(stage.links, id) : []
}

/** Keys whose object is being built right now, so repeated syncs while a
 *  file is still parsing don't start (and add) duplicate copies of it. */
const building = new WeakMap<WorldSession, Set<string>>()

/** Keys whose object could not be built: said once, and not tried again
 *  for as long as the stage stays open. */
const failed = new WeakMap<WorldSession, Set<string>>()

/** Brings the session's objects in line with the store: drops what's gone,
 *  re-poses what exists, builds what's missing. A build resolving later
 *  re-runs this against the store as it is *then*, so it never lands with
 *  a pose captured before it started. */
function syncSession(session: WorldSession, stageId: string): void {
  const state = useStore.getState()
  const project = selectCurrentProject(state)
  if (!project || session.isDisposed) return
  const kind = project.stages[stageId]?.kind
  const entries = sceneEntries(project, stageId)
  const valid = new Set(entries.map((e) => e.key))
  for (const id of Array.from(session.objects.keys())) {
    if (!valid.has(id)) session.removeObject(id)
  }
  let inFlight = building.get(session)
  if (!inFlight) building.set(session, (inFlight = new Set()))
  for (const entry of entries) {
    // (not getObject: a released piece's key also names the piece it left
    // behind in its assembly's group)
    const existing = session.objects.get(entry.key)
    if (existing) {
      applyEntry(existing, entry, true)
      continue
    }
    if (inFlight.has(entry.key) || failed.get(session)?.has(entry.key)) continue
    inFlight.add(entry.key)
    const done = inFlight
    buildInput(project, entry.row)
      .then((obj) => {
        done.delete(entry.key)
        if (session.isDisposed) return
        applyEntry(obj, entry, true)
        session.addObject(entry.key, obj)
        syncSession(session, stageId)
        session.frameAllIfUntouched()
      })
      .catch((e: unknown) => {
        done.delete(entry.key)
        if (session.isDisposed) return
        failed.set(session, (failed.get(session) ?? new Set()).add(entry.key))
        console.error('[mesh-studio] could not load', entry.key, e)
        useStore
          .getState()
          .notify(
            `Could not load ${inputLabel(project, entry.key)}: ${e instanceof Error ? e.message : String(e)}`,
          )
      })
  }
  // pieces inside assembly inputs: visibility / opacity per piece
  applyPartLooks(session, project, stageId)
  // an animation's own lighting (an assembly is always lit the default way)
  const lit = kind === 'animation' ? project.stages[stageId] : undefined
  session.setLights(lit?.lights ?? [])
  session.setEnvironment(lit?.environment ?? null)
  session.setFloor(lit?.floor ?? null)
  // members sit at their connector pose now; an animation shows the
  // playhead's frame instead (unless playback is already driving it)
  if (kind === 'animation' && !state.playing) showAnimateFrame(session, state.playT)
}

/** Mounts a WorldSession on `container` for as long as it's rendered
 *  (recreate the caller with a new `key` to force a remount when switching
 *  stages — see App.tsx), and keeps the given stage's members synced onto
 *  it whenever the store changes. */
export function useWorldSession(container: HTMLDivElement | null, stageId: string | null) {
  const [session, setSession] = useState<WorldSession | null>(null)
  const project = useStore(selectCurrentProject)
  const worldSelId = useStore((s) => s.worldSelId)
  const gizmoMode = useStore((s) => s.gizmoMode)
  const pendingPicks = useStore((s) => s.pendingPicks)
  const keypointMode = useStore((s) => (s.wmode === 'assembly' && s.kpOn ? s.kpMode : null))

  useEffect(() => {
    if (!container) return
    const created = new WorldSession(container, {
      onReady: () => useStore.getState().setHint(''),
      onPick,
      onFrame,
      onObjectMoved,
      companionsOf,
    })
    keepParsedMeshes(selectCurrentProject(useStore.getState())?.meshes ?? [])
    // someone following the assembly only watches; they keep looking from
    // where they were. An author looks from where the stage was left.
    const viewing = useStore.getState().view === 'viewer'
    created.setPresenting(viewing)
    const left = viewing
      ? viewerOrbit
      : stageId
        ? useStore.getState().stageViews[stageId]?.orbit
        : null
    if (left) created.holdView(left.pos, left.target)
    currentSession = created
    setSession(created)
    return () => {
      if (viewing) viewerOrbit = created.leftView ?? viewerOrbit
      else if (stageId) useStore.getState().rememberOrbit(stageId, created.leftView)
      created.dispose()
      if (currentSession === created) currentSession = null
      setSession(null)
    }
  }, [container, stageId])

  // `project` is only a trigger here — syncSession reads the latest store
  useEffect(() => {
    if (session && project && stageId) syncSession(session, stageId)
  }, [session, project, stageId])

  // scrubbing / seeking while paused shows that frame (playback applies
  // its own frames from the render loop). A store subscription rather than
  // selectors: playT changes every frame while playing, and re-rendering
  // the viewport for it would be wasted work.
  const wmode = useStore((s) => s.wmode)
  const cameraView = useStore((s) => s.cameraView)
  useEffect(() => {
    if (!session) return
    const show = (s: AppState) => {
      if (s.wmode === 'animate' && !s.playing) showAnimateFrame(session, s.playT)
    }
    show(useStore.getState())
    return useStore.subscribe((s, prev) => {
      if (
        s.playT !== prev.playT ||
        s.playing !== prev.playing ||
        s.cameraView !== prev.cameraView ||
        s.wmode !== prev.wmode
      ) {
        show(s)
      }
    })
  }, [session])

  // inside assemblies: assembly mode works on whole inputs (keypoints);
  // animate reaches down to single pieces
  useEffect(() => {
    session?.setPickDepth(wmode === 'assembly' ? 'top' : 'part')
  }, [session, wmode])

  // "look through the animation camera" (animate mode) renders through the
  // camera object while the working view waits untouched
  const hasCamTrack = useStore(
    (s) =>
      !!stageId &&
      !!selectCurrentProject(s)?.stages[stageId]?.tracks.some((t) => t.targetKind === 'camera'),
  )
  useEffect(() => {
    session?.setLookThrough(wmode === 'animate' && cameraView && hasCamTrack)
  }, [session, wmode, cameraView, hasCamTrack])

  // the animation camera's frame shape (preview bars, view pyramid, export)
  const frame = useStore((s) =>
    stageId ? (selectCurrentProject(s)?.stages[stageId]?.frame ?? null) : null,
  )
  useEffect(() => {
    if (frame) session?.setFrameAspect(aspectOf(frame))
  }, [session, frame])

  useEffect(() => {
    session?.setSelected(worldSelId)
  }, [session, worldSelId])

  useEffect(() => {
    session?.setMode(gizmoMode)
  }, [session, gizmoMode])

  useEffect(() => {
    session?.setPickMarkers(pendingPicks)
  }, [session, pendingPicks])

  useEffect(() => {
    session?.setKeypointMode(keypointMode)
  }, [session, keypointMode])

  return session
}
