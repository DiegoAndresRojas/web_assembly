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

import { assemblyParts, membersOf, parentKey, restPoseOf } from '@/lib/graph'
import { evalStage, stageDuration } from '@/lib/timeline'
import { applyColor, applyOpacity, applyPose } from '@/lib/three/buildMesh'
import { buildInput } from '@/lib/three/stageInput'
import { WorldSession, type PickHit } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { AppState } from '@/store/types'
import type { MembersRow, Pose, Project, StageMember } from '@/types/project'

let currentSession: WorldSession | null = null

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
  state.selectWorldObject(hit.nodeId)
}

/** Gizmo drags only move the live object. Assembly writes the result back
 *  to the stage member (keypoint links solve against it). In animate mode
 *  a move is a preview until recorded into an action (recordPose). */
function onObjectMoved(nodeId: string, pose: Pose): void {
  const state = useStore.getState()
  if (state.wmode === 'assembly') state.setMemberPose(nodeId, pose)
}

/** Every piece of a stage's scene (key + connector pose): its inputs and,
 *  for assembly inputs, every part inside them. */
export function stagePieces(project: Project, stageId: string): Array<{ key: string; rest: Pose }> {
  return membersOf(project, stageId).flatMap((row) => {
    // a stage never opened has no member records yet: default pose
    const self = { key: row.node.id, rest: memberOr(stageId, project, row.node.id).pose }
    if (row.mesh) return [self]
    return [self, ...assemblyParts(project, row.node.id).map((p) => ({ key: p.key, rest: p.pose }))]
  })
}

/** Poses every piece of `stageId` for time `t`: tracked pieces where their
 *  actions put them, the rest at their connector pose. Returns the animation
 *  camera's pose at `t`, if the stage animates one — callers decide
 *  whether the viewport camera follows it. */
export function applyStageAt(
  session: WorldSession,
  project: Project,
  stageId: string,
  t: number,
): Pose | null {
  const stage = project.stages[stageId]
  if (!stage) return null
  const evald = evalStage(stage, t, (key) => restPoseOf(project, stageId, key))
  for (const { key, rest } of stagePieces(project, stageId)) {
    const obj = session.getObject(key)
    if (obj) applyPose(obj, evald.meshes[key] ?? rest)
  }
  return evald.camera
}

const IDENTITY_POSE: Pose = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

/** A member record for an input, or defaults when the stage holding it
 *  was never opened (being wired in is all it takes to be shown). */
function memberOr(stageId: string, project: Project, nodeId: string): StageMember {
  return (
    project.stages[stageId]?.members.find((m) => m.nodeId === nodeId) ?? {
      nodeId,
      visible: true,
      opacity: 1,
      pose: IDENTITY_POSE,
      color: null,
    }
  )
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
      const obj = session.getObject(part.key)
      if (!obj) continue
      obj.visible = look?.visible ?? true
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
  /** An assembly's output inside another assembly is, for now, only there
   *  to look at: no selection, no keypoints on it. */
  viewOnly: boolean
}

/** What should be on screen for `stageId`: its own inputs. */
function sceneEntries(project: Project, stageId: string): SceneEntry[] {
  const stage = project.stages[stageId]
  if (!stage) return []
  return membersOf(project, stageId).flatMap((row) => {
    const member = stage.members.find((m) => m.nodeId === row.node.id)
    if (!member) return []
    const viewOnly = stage.kind === 'assembly' && !row.mesh
    return [{ key: row.node.id, row, member, viewOnly }]
  })
}

function applyEntry(obj: Object3D, { row, member, viewOnly }: SceneEntry, withPose: boolean): void {
  if (withPose) applyPose(obj, member.pose)
  // an assembly input carries its pieces' scales inside it
  obj.scale.setScalar(row.mesh ? (row.node.scale ?? 1) : 1)
  applyColor(obj, member.color ?? row.node.color)
  applyOpacity(obj, member.opacity)
  obj.visible = member.visible
  obj.userData.msViewOnly = viewOnly
}

/** Keys whose object is being built right now, so repeated syncs while a
 *  file is still parsing don't start (and add) duplicate copies of it. */
const building = new WeakMap<WorldSession, Set<string>>()

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
    const existing = session.getObject(entry.key)
    if (existing) {
      applyEntry(existing, entry, true)
      continue
    }
    if (inFlight.has(entry.key)) continue
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
      .catch(() => done.delete(entry.key))
  }
  // pieces inside assembly inputs: visibility / opacity per piece
  applyPartLooks(session, project, stageId)
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
    })
    currentSession = created
    setSession(created)
    return () => {
      created.dispose()
      if (currentSession === created) currentSession = null
      setSession(null)
    }
  }, [container])

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
