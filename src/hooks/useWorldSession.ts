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

import { membersOf, observedStageIds } from '@/lib/graph'
import { evalStage, stageDuration } from '@/lib/timeline'
import { applyColor, applyOpacity, applyPose } from '@/lib/three/buildMesh'
import { buildInput } from '@/lib/three/stageInput'
import { WorldSession, type PickHit } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { MembersRow, Pose, Project, Stage, StageMember } from '@/types/project'

const CLOCK_THROTTLE_S = 0.08

let currentSession: WorldSession | null = null
let clockAcc = 0

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

/** Gizmo drags only move the live object — write the result back to the
 *  stage member, or keypoint links would solve against a stale pose (and
 *  the next store sync would snap the mesh back). Animate mode keeps its
 *  own pose flow through timeline actions, so only assembly persists. */
function onObjectMoved(nodeId: string, pose: Pose): void {
  const state = useStore.getState()
  if (state.wmode === 'assembly') state.setMemberPose(nodeId, pose)
}

export function applyStageTime(
  session: WorldSession,
  stage: Stage,
  t: number,
  keyPrefix = '',
): void {
  const evald = evalStage(stage, t)
  for (const nodeId in evald.meshes) {
    const obj = session.getObject(keyPrefix + nodeId)
    if (obj) applyPose(obj, evald.meshes[nodeId])
  }
  if (evald.camera) session.setCameraPose(evald.camera)
}

/** For an observer stage, animation playback follows the first observed
 *  stage that actually has animated actions (there's no track-editing UI
 *  in observer mode, so playing more than one at once isn't supported). */
export function firstAnimatedObserved(
  project: Project,
  stageId: string,
): { id: string; stage: Stage } | null {
  for (const id of observedStageIds(project, stageId)) {
    const s = project.stages[id]
    if (s && stageDuration(s) > 0) return { id, stage: s }
  }
  return null
}

function onFrame(dt: number): void {
  const session = currentSession
  if (!session) return
  const state = useStore.getState()
  if (!state.playing || !state.aid) return
  const project = selectCurrentProject(state)
  const ownStage = project?.stages[state.aid]
  if (!project || !ownStage) return

  const target =
    ownStage.kind === 'observer'
      ? firstAnimatedObserved(project, state.aid)
      : { id: '', stage: ownStage }
  if (!target) return
  const keyPrefix = target.id ? target.id + '::' : ''

  const dur = stageDuration(target.stage)
  let t = state.playT + dt
  let playing = true
  if (t >= dur) {
    t = dur
    playing = false
  }
  applyStageTime(session, target.stage, t, keyPrefix)

  clockAcc += dt
  if (clockAcc > CLOCK_THROTTLE_S || !playing) {
    clockAcc = 0
    useStore.setState((s) => {
      s.playT = t
      s.playing = playing
    })
  }
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
  const entriesOf = (id: string, prefix: string, visibleOnly: boolean): SceneEntry[] => {
    const s = project.stages[id]
    if (!s) return []
    return membersOf(project, id).flatMap((row) => {
      const member = s.members.find((m) => m.nodeId === row.node.id)
      if (!member || (visibleOnly && !member.visible)) return []
      const viewOnly = s.kind === 'assembly' && !row.mesh
      return [{ key: prefix + row.node.id, row, member, viewOnly }]
    })
  }
  if (stage.kind !== 'observer') return entriesOf(stageId, '', false)
  return observedStageIds(project, stageId).flatMap((id) => entriesOf(id, id + '::', true))
}

function applyEntry(obj: Object3D, { row, member, viewOnly }: SceneEntry): void {
  applyPose(obj, member.pose)
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
  const project = selectCurrentProject(useStore.getState())
  if (!project || session.isDisposed) return
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
      applyEntry(existing, entry)
      continue
    }
    if (inFlight.has(entry.key)) continue
    inFlight.add(entry.key)
    const done = inFlight
    buildInput(project, entry.row)
      .then((obj) => {
        done.delete(entry.key)
        if (session.isDisposed) return
        session.addObject(entry.key, obj)
        syncSession(session, stageId)
        session.frameAllIfUntouched()
      })
      .catch(() => done.delete(entry.key))
  }
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
