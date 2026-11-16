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

import {
  assemblyParts,
  membersOf,
  observedStageIds,
  observerSteps,
  parentKey,
  restPoseOf,
  stepPrefix,
} from '@/lib/graph'
import { easeValue, evalStage, stageDuration, tweenPoses } from '@/lib/timeline'
import { applyColor, applyOpacity, applyPose, readPose } from '@/lib/three/buildMesh'
import { buildInput } from '@/lib/three/stageInput'
import { WorldSession, type PickHit } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { AppState, ObserverPhase } from '@/store/types'
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
 *  a move is a preview until recorded into an action (recordPose). In an
 *  observer the move is the user playing with the world — which, while
 *  paused, rules out continuing the paused animation. */
function onObjectMoved(nodeId: string, pose: Pose): void {
  const state = useStore.getState()
  if (state.wmode === 'assembly') state.setMemberPose(nodeId, pose)
  else if (state.wmode === 'observer') {
    markObserverMoved()
    if (state.obsPhase === 'paused') state.obsMarkAltered()
  }
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
 *  actions put them, the rest at their connector pose. `prefix` addresses
 *  the pieces of an observed stage (`obsId::`). Returns the animation
 *  camera's pose at `t`, if the stage animates one — callers decide
 *  whether the viewport camera follows it. */
export function applyStageAt(
  session: WorldSession,
  project: Project,
  stageId: string,
  t: number,
  prefix = '',
): Pose | null {
  const stage = project.stages[stageId]
  if (!stage) return null
  const evald = evalStage(stage, t, (key) => restPoseOf(project, stageId, key))
  for (const { key, rest } of stagePieces(project, stageId)) {
    const obj = session.getObject(prefix + key)
    if (obj) applyPose(obj, evald.meshes[key] ?? rest)
  }
  return evald.camera
}

/** The stages one observer step observes that actually animate something. */
export function animatedInStep(project: Project, stepId: string): string[] {
  return observedStageIds(project, stepId).filter((id) => {
    const s = project.stages[id]
    return !!s && stageDuration(s) > 0
  })
}

/** Length of one observer step: its longest animation. */
export function stepDuration(project: Project, stepId: string): number {
  return Math.max(
    0,
    ...animatedInStep(project, stepId).map((id) => stageDuration(project.stages[id])),
  )
}

/** Shows the steps of an observer chain up to `current`: earlier and
 *  current steps' pieces as their members say, later steps hidden. */
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

/** Everything one observer step shows — only the stages wired into it on
 *  the board (their inputs and pieces). `prefix` keys their objects. */
function stepSources(project: Project, step: string): Array<{ id: string; prefix: string }> {
  return observedStageIds(project, step).map((id) => ({ id, prefix: stepPrefix(step, id) }))
}

/** The top-level inputs a connected stage shows. */
function sourceRows(project: Project, src: { id: string }) {
  return membersOf(project, src.id)
}

function showSteps(
  session: WorldSession,
  project: Project,
  steps: string[],
  current: number,
): void {
  steps.forEach((step, i) => {
    for (const src of stepSources(project, step)) {
      for (const row of sourceRows(project, src)) {
        const obj = session.getObject(src.prefix + row.node.id)
        if (!obj) continue
        obj.visible = i <= current && memberOr(src.id, project, row.node.id).visible
      }
    }
  })
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
function applyPartLooks(
  session: WorldSession,
  project: Project,
  stageId: string,
  prefix = '',
): void {
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
      const obj = session.getObject(prefix + part.key)
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
  } else if (state.wmode === 'observer') {
    observerTick(session, dt)
  }
}

// ---------- observer runtime ----------

/** How long pieces take to glide back to the animation's start. */
const RETURN_S = 1
/** How long the camera takes to rejoin its track after the user orbited
 *  during a pause. */
const CAMERA_REJOIN_S = 0.5

interface ObserverRuntime {
  session: WorldSession | null
  /** Phase / run / step seen last frame — changes are detected against them. */
  phase: ObserverPhase
  run: number
  step: number
  t: number
  /** returning: where every piece (and the camera) started and must end. */
  glide: {
    u: number
    pieces: Array<{ key: string; from: Pose; to: Pose }>
    camera: { from: Pose; to: Pose } | null
  } | null
  /** continuing after the camera was orbited during a pause. */
  rejoin: { u: number; from: Pose } | null
  pausedView: Pose | null
  /** Objects laid out at the step's initial conditions so far (re-done
   *  while files are still loading, until the user moves something). */
  laidOut: number
  userMoved: boolean
}

const obs: ObserverRuntime = {
  session: null,
  phase: 'idle',
  run: 0,
  step: -1,
  t: 0,
  glide: null,
  rejoin: null,
  pausedView: null,
  laidOut: -1,
  userMoved: false,
}

/** Called when the user moves a piece in an observer. */
function markObserverMoved(): void {
  obs.userMoved = true
}

/** The animated stage (of a step) whose camera track drives the view. */
function drivingCamera(project: Project, ids: string[]): string | null {
  return ids.find((id) => project.stages[id]?.tracks.some((t) => t.targetKind === 'camera')) ?? null
}

/** Shows a step's animated stages at `t`; returns the camera pose the
 *  driving camera track has then. */
function showObserved(
  session: WorldSession,
  project: Project,
  step: string,
  ids: string[],
  t: number,
): Pose | null {
  let camera: Pose | null = null
  const camId = drivingCamera(project, ids)
  for (const id of ids) {
    const cam = applyStageAt(session, project, id, t, stepPrefix(step, id))
    if (id === camId) camera = cam
  }
  return camera
}

function samePose(a: Pose, b: Pose): boolean {
  const eps = 1e-4
  return (['pos', 'rot'] as const).every((k) =>
    (['x', 'y', 'z'] as const).every((ax) => Math.abs(a[k][ax] - b[k][ax]) < eps),
  )
}

/** Mirrors the runtime clock into the store for the transport's display. */
function syncObsClock(t: number): void {
  if (useStore.getState().obsT === t) return
  useStore.setState((s) => {
    s.obsT = t
  })
}

/** Where every shown piece glides to when a step (re)starts: earlier
 *  steps' pieces to where their animations end, the current step's to
 *  where its animations start (connector pose for anything not animated). */
function glideTargets(
  session: WorldSession,
  project: Project,
  steps: string[],
  current: number,
): Array<{ key: string; from: Pose; to: Pose }> {
  const pieces: Array<{ key: string; from: Pose; to: Pose }> = []
  steps.slice(0, current + 1).forEach((step, i) => {
    for (const id of observedStageIds(project, step)) {
      const s = project.stages[id]
      if (!s) continue
      const at = i < current ? stageDuration(s) : 0
      const pose = evalStage(s, at, (key) => restPoseOf(project, id, key))
      for (const { key, rest } of stagePieces(project, id)) {
        const obj = session.getObject(stepPrefix(step, id) + key)
        if (obj) {
          pieces.push({
            key: stepPrefix(step, id) + key,
            from: readPose(obj),
            to: pose.meshes[key] ?? rest,
          })
        }
      }
    }
  })
  return pieces
}

function observerTick(session: WorldSession, dt: number): void {
  const state = useStore.getState()
  const project = selectCurrentProject(state)
  const stageId = state.aid
  if (!project || !stageId) return
  if (obs.session !== session) {
    Object.assign(obs, {
      session,
      phase: 'idle',
      run: state.obsRun,
      step: -1,
      t: 0,
      glide: null,
      rejoin: null,
      pausedView: null,
      laidOut: -1,
      userMoved: false,
    })
  }
  const steps = observerSteps(project, stageId)
  const current = Math.min(state.obsStep, steps.length - 1)
  const step = steps[current]
  const ids = animatedInStep(project, step)
  const phase = state.obsPhase
  const camId = drivingCamera(project, ids)

  if (current !== obs.step) {
    obs.step = current
    showSteps(session, project, steps, current)
  }

  // at rest the world shows the step exactly as its animation starts —
  // pieces at their initial conditions, the view from the animation camera
  // — redone while files finish loading, until the user takes over
  if (phase === 'idle' && !obs.userMoved && session.objects.size !== obs.laidOut) {
    obs.laidOut = session.objects.size
    showSteps(session, project, steps, current)
    for (const p of glideTargets(session, project, steps, current)) {
      const obj = session.getObject(p.key)
      if (obj) applyPose(obj, p.to)
    }
    const startView = camId ? evalStage(project.stages[camId], 0).camera : null
    if (startView && !session.viewWasTouched) session.adoptView(startView)
  }

  // a new Play / Next / Previous restarts the step even mid-glide
  const restarted = state.obsRun !== obs.run
  if (phase !== obs.phase || restarted) {
    const prev = obs.phase
    obs.phase = phase
    obs.run = state.obsRun
    if (phase === 'returning') {
      // capture where the user left everything, and glide it into place
      session.setLocked(true)
      const camTo = camId ? evalStage(project.stages[camId], 0).camera : null
      // the shot glides in from what's on screen: the animation camera if
      // already looking through it (Next / Previous mid-play), else the
      // user's own view
      const camFrom = session.getAnimCameraPose() ?? session.getCameraPose()
      if (camTo) {
        session.setAnimCamera(camFrom)
        session.setLookThrough(true)
      } else {
        // this step animates no camera: back to the user's view, frozen
        session.setLookThrough(false)
        session.setAnimCamera(null)
      }
      obs.glide = {
        u: 0,
        pieces: glideTargets(session, project, steps, current),
        camera: camTo ? { from: camFrom, to: camTo } : null,
      }
      obs.t = 0
      obs.rejoin = null
    } else if (phase === 'playing') {
      session.setLocked(true)
      if (prev === 'paused' && camId) {
        // continuing: if the user orbited meanwhile, glide back onto the track
        const now = session.getCameraPose()
        if (obs.pausedView && !samePose(now, obs.pausedView)) obs.rejoin = { u: 0, from: now }
        session.setAnimCamera(now)
        session.setLookThrough(true)
      }
    } else {
      // paused / ended / idle: hand the world back to the user, looking
      // from wherever the animation camera is now
      const camNow = session.getAnimCameraPose()
      session.setLookThrough(false)
      session.setAnimCamera(null)
      if (camNow) session.adoptView(camNow)
      session.setLocked(false)
      obs.pausedView = session.getCameraPose()
      syncObsClock(obs.t)
    }
  }

  if (phase === 'returning' && obs.glide) {
    const g = obs.glide
    g.u = Math.min(1, g.u + dt / RETURN_S)
    const e = easeValue('easeInOut', g.u)
    for (const p of g.pieces) {
      const obj = session.getObject(p.key)
      if (obj) applyPose(obj, tweenPoses(p.from, p.to, e))
    }
    if (g.camera) session.setAnimCamera(tweenPoses(g.camera.from, g.camera.to, e))
    if (g.u >= 1) {
      obs.glide = null
      state.obsSetPhase('playing', 0)
    }
    return
  }

  if (phase === 'playing') {
    const dur = stepDuration(project, step)
    if (obs.rejoin) {
      // hold the frame while the camera rejoins its track
      const r = obs.rejoin
      r.u = Math.min(1, r.u + dt / CAMERA_REJOIN_S)
      const cam = showObserved(session, project, step, ids, obs.t)
      if (cam) session.setAnimCamera(tweenPoses(r.from, cam, easeValue('easeInOut', r.u)))
      if (r.u >= 1) obs.rejoin = null
      return
    }
    obs.t = Math.min(dur, obs.t + dt)
    const cam = showObserved(session, project, step, ids, obs.t)
    if (cam) session.setAnimCamera(cam)
    if (obs.t >= dur) {
      // looping: on into the next step (back to the first after the last)
      if (state.obsLoop) state.obsGoTo((current + 1) % steps.length)
      else state.obsSetPhase('ended', dur)
      return
    }
    syncObsClock(obs.t)
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

/** What should be on screen for `stageId`: its own inputs, or — for an
 *  observer — every visible input of each stage it observes (keyed
 *  `observedId::nodeId` so the same mesh in two stages stays distinct). */
function sceneEntries(project: Project, stageId: string): SceneEntry[] {
  const stage = project.stages[stageId]
  if (!stage) return []
  if (stage.kind !== 'observer') {
    return membersOf(project, stageId).flatMap((row) => {
      const member = stage.members.find((m) => m.nodeId === row.node.id)
      if (!member) return []
      const viewOnly = stage.kind === 'assembly' && !row.mesh
      return [{ key: row.node.id, row, member, viewOnly }]
    })
  }
  // an observer (chain): only what each step has wired in, each step with
  // its own pieces (later steps hidden until reached, see showSteps)
  return observerSteps(project, stageId).flatMap((step) =>
    stepSources(project, step).flatMap((src) =>
      sourceRows(project, src).flatMap((row) => {
        const member = memberOr(src.id, project, row.node.id)
        if (!member.visible) return []
        return [{ key: src.prefix + row.node.id, row, member, viewOnly: false }]
      }),
    ),
  )
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
      // an observer's pieces belong to whoever is playing with them — a
      // store change must not snap them back
      applyEntry(existing, entry, kind !== 'observer')
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
  // pieces inside assembly inputs: this stage's (or, for an observer, each
  // observed stage's) visibility / opacity per piece
  if (kind === 'observer') {
    const steps = observerSteps(project, stageId)
    for (const step of steps) {
      for (const id of observedStageIds(project, step)) {
        applyPartLooks(session, project, id, stepPrefix(step, id))
      }
    }
    // later steps of a chain stay hidden until reached
    showSteps(session, project, steps, Math.min(state.obsStep, steps.length - 1))
  } else {
    applyPartLooks(session, project, stageId)
  }
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
  // animate and observer reach down to single pieces
  useEffect(() => {
    session?.setPickDepth(wmode === 'assembly' ? 'top' : 'part')
  }, [session, wmode])

  // "look through the animation camera" (animate mode) renders through the
  // camera object while the working view waits untouched; observer
  // playback drives its view from the render loop instead
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
