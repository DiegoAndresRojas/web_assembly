// React glue between the store (pure data) and the imperative three.js
// WorldSession: mounts/unmounts the session on the viewport element,
// dispatches pointer picks (resolving keypoint snap candidates when
// keypoint-picking is on), drives animation playback, and keeps every
// stage member's live pose/color/opacity/visibility in sync with the
// store whenever it changes.
//
// One WorldView (keyed by stage id, see App.tsx) owns exactly one
// WorldSession, so a module-level "current session" ref is enough for the
// stable onPick/onFrame callbacks to reach it without going stale.
import { useEffect, useState } from 'react'

import { membersOf } from '@/lib/graph'
import { evalStage, stageDuration } from '@/lib/timeline'
import {
  applyColor,
  applyOpacity,
  applyPose,
  buildMesh,
  keypointCandidates,
} from '@/lib/three/buildMesh'
import { WorldSession, type PickHit } from '@/lib/three/worldSession'
import { useStore } from '@/store'
import { selectCurrentProject } from '@/store/selectors'
import type { Project, Stage } from '@/types/project'

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
    const obj = currentSession?.getObject(hit.nodeId) ?? null
    const candidates = obj ? keypointCandidates(obj) : []
    state.pickPoint(state.resolveKeypointCandidate(hit, candidates))
    return
  }
  state.selectWorldObject(hit.nodeId)
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
  stage: Stage,
): { id: string; stage: Stage } | null {
  for (const id of stage.observing) {
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
      ? firstAnimatedObserved(project, ownStage)
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

function syncOwnMembers(
  session: WorldSession,
  project: Project,
  stageId: string,
  stage: Stage,
): void {
  const rows = membersOf(project, stageId)
  const validIds = new Set(rows.map((r) => r.node.id))
  for (const id of Array.from(session.objects.keys())) {
    if (!validIds.has(id)) session.removeObject(id)
  }
  for (const row of rows) {
    const member = stage.members.find((m) => m.nodeId === row.node.id)
    if (!member) continue
    const existing = session.getObject(row.node.id)
    if (existing) {
      applyPose(existing, member.pose)
      applyColor(existing, member.color ?? row.mesh.color)
      applyOpacity(existing, member.opacity)
      existing.visible = member.visible
      continue
    }
    buildMesh(row.mesh).then((obj) => {
      if (session.isDisposed) return
      applyPose(obj, member.pose)
      applyColor(obj, member.color ?? row.mesh.color)
      applyOpacity(obj, member.opacity)
      obj.visible = member.visible
      session.addObject(row.node.id, obj)
      session.frameAll()
    })
  }
}

function syncObserverMembers(session: WorldSession, project: Project, stage: Stage): void {
  const validKeys = new Set<string>()
  for (const observedId of stage.observing) {
    const observedStage = project.stages[observedId]
    if (!observedStage) continue
    for (const row of membersOf(project, observedId)) {
      const member = observedStage.members.find((m) => m.nodeId === row.node.id)
      if (!member || !member.visible) continue
      const key = observedId + '::' + row.node.id
      validKeys.add(key)
      const existing = session.getObject(key)
      if (existing) {
        applyPose(existing, member.pose)
        applyColor(existing, member.color ?? row.mesh.color)
        applyOpacity(existing, member.opacity)
        continue
      }
      buildMesh(row.mesh).then((obj) => {
        if (session.isDisposed) return
        applyPose(obj, member.pose)
        applyColor(obj, member.color ?? row.mesh.color)
        applyOpacity(obj, member.opacity)
        session.addObject(key, obj)
        session.frameAll()
      })
    }
  }
  for (const id of Array.from(session.objects.keys())) {
    if (!validKeys.has(id)) session.removeObject(id)
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
  const stage = stageId ? (project?.stages[stageId] ?? null) : null

  useEffect(() => {
    if (!container) return
    const created = new WorldSession(container, {
      onReady: () => useStore.getState().setHint(''),
      onPick,
      onFrame,
    })
    currentSession = created
    setSession(created)
    return () => {
      created.dispose()
      if (currentSession === created) currentSession = null
      setSession(null)
    }
  }, [container])

  useEffect(() => {
    if (!session || !project || !stage || !stageId) return
    if (stage.kind === 'observer') syncObserverMembers(session, project, stage)
    else syncOwnMembers(session, project, stageId, stage)
  }, [session, project, stage, stageId])

  useEffect(() => {
    session?.setSelected(worldSelId)
  }, [session, worldSelId])

  useEffect(() => {
    session?.setMode(gizmoMode)
  }, [session, gizmoMode])

  useEffect(() => {
    session?.setPickMarkers(pendingPicks.map((p) => p.point))
  }, [session, pendingPicks])

  return session
}
