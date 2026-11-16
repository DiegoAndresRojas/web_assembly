// The open animation stage's lighting: its lights (objects in the world,
// selectable and animatable like the camera), environment and floor.
// Committed edits are undoable through the shared history slice; live ones
// (sliders, typing) expect the caller to open the undo step (beginEdit).
import {
  aimPose,
  fillLight,
  isLightKey,
  lightingAt,
  lightKey,
  lightSources,
  lightTrack,
  newLight,
  presetLights,
  setLighting,
} from '@/lib/lights'
import { normalizeLight, normalizeTrack } from '@/lib/migrations'
import { uid } from '@/lib/utils'
import { findProject } from './helpers'
import type { AppState, Get, LightsActions, Set } from './types'
import type { Stage } from '@/types/project'
import type { Draft } from 'immer'

function openAnimation(state: Draft<AppState>): Draft<Stage> | null {
  const project = findProject(state, state.pid)
  const stage = project && state.aid ? project.stages[state.aid] : undefined
  return stage?.kind === 'animation' ? stage : null
}

/** Drops whatever was selected that the stage no longer has. */
function dropStaleSelection(state: Draft<AppState>, stage: Draft<Stage>): void {
  if (isLightKey(state.worldSelId)) {
    const stillThere = stage.lights.some((l) => lightKey(l.id) === state.worldSelId)
    if (!stillThere) state.worldSelId = null
  }
  if (state.selection && !stage.tracks.some((t) => t.id === state.selection?.trackId)) {
    state.selection = null
  }
}

export function createLightsSlice(set: Set, get: Get): LightsActions {
  const pushHistory = () => get().pushHistory()

  return {
    addLight(kind, bounds) {
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        if (!stage) return
        // the first light replaces the default lighting altogether: give
        // it a fill, or everything it doesn't reach would turn black
        if (stage.lights.length === 0 && kind !== 'ambient') stage.lights.push(fillLight(bounds))
        const light = newLight(kind, bounds, stage.lights)
        stage.lights.push(light)
        state.worldSelId = lightKey(light.id)
        state.selection = null
      })
    },

    applyLightPreset(preset, bounds) {
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        if (!stage) return
        stage.lights = presetLights(preset, bounds)
        stage.tracks = stage.tracks.filter((t) => t.targetKind !== 'light')
        dropStaleSelection(state, stage)
      })
    },

    clearLights() {
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        if (!stage) return
        stage.lights = []
        stage.tracks = stage.tracks.filter((t) => t.targetKind !== 'light')
        dropStaleSelection(state, stage)
      })
    },

    updateLight(id, patch) {
      set((state) => {
        const stage = openAnimation(state)
        const i = stage?.lights.findIndex((l) => l.id === id) ?? -1
        if (!stage || i < 0) return
        // (through the normalizer: every value ends up in its valid range)
        const next = normalizeLight({
          ...stage.lights[i],
          ...patch,
          id,
          kind: stage.lights[i].kind,
        })
        if (next) stage.lights[i] = next
      })
    },

    setLightPose(id, pose) {
      pushHistory()
      get().updateLight(id, { pose })
    },

    aimLight(id, target) {
      const stage = get().projects.find((p) => p.id === get().pid)?.stages[get().aid ?? '']
      const light = stage?.lights.find((l) => l.id === id)
      if (!light) return
      get().setLightPose(id, aimPose(light.pose.pos, target))
    },

    duplicateLight(id) {
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        const source = stage?.lights.find((l) => l.id === id)
        if (!stage || !source) return
        const copy = normalizeLight({
          ...JSON.parse(JSON.stringify(source)),
          id: uid(),
          name: source.name + ' copy',
        })
        if (!copy) return
        stage.lights.push(copy)
        state.worldSelId = lightKey(copy.id)
        state.selection = null
      })
    },

    removeLight(id) {
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        if (!stage) return
        const key = lightKey(id)
        stage.lights = stage.lights.filter((l) => l.id !== id)
        stage.tracks = stage.tracks.filter((t) => !(t.targetKind === 'light' && t.nodeId === key))
        dropStaleSelection(state, stage)
      })
    },

    addLightTrack(id) {
      const stage = get().projects.find((p) => p.id === get().pid)?.stages[get().aid ?? '']
      const light = stage?.lights.find((l) => l.id === id)
      if (!light || lightTrack(stage, id)) return
      pushHistory()
      set((state) => {
        const open = openAnimation(state)
        if (!open) return
        const track = normalizeTrack({
          targetKind: 'light',
          nodeId: lightKey(id),
          initPose: light.pose,
        })!
        open.tracks.push(track)
        state.worldSelId = lightKey(id)
        state.selection = { trackId: track.id, actionId: 'init' }
      })
    },

    importLights(fromStageId, mode) {
      const { pid, aid, projects } = get()
      const project = projects.find((p) => p.id === pid)
      // only from an animation that shares pieces with this one
      const allowed =
        project && aid && lightSources(project, aid).some((s) => s.stageId === fromStageId)
      const source = allowed ? project.stages[fromStageId] : undefined
      if (!source) return
      const taken = lightingAt(source, 'end')
      pushHistory()
      set((state) => {
        const stage = openAnimation(state)
        if (!stage) return
        if (mode === 'replace') setLighting(stage, taken)
        else {
          stage.lights.push(...taken.lights)
          stage.environment ??= taken.environment
          stage.floor ??= taken.floor
        }
        dropStaleSelection(state, stage)
      })
    },

    setEnvironment(environment) {
      set((state) => {
        const stage = openAnimation(state)
        if (stage) stage.environment = environment ? { ...environment } : null
      })
    },

    setFloor(floor) {
      set((state) => {
        const stage = openAnimation(state)
        if (stage) stage.floor = floor ? { ...floor } : null
      })
    },
  }
}
