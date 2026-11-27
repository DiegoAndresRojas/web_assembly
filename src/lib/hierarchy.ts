// A project as an assembly hierarchy, the way a training pipeline reads
// it (`assembly.json`, format 1): pieces with their files, and assemblies
// with their children, the rigid transform of each (child → parent, in
// meters) and the order they go in.
//
// The board builds a product as chains: each assembly takes the one
// before it plus new pieces (Assembly 1 → Assembly 2 → …). Read from its
// last node, a chain is one assembly of the hierarchy and each node of it
// one of its stages. An assembly node that takes two or more assemblies
// joins chains: each of those is a sub-assembly, a child of the whole.
//
// What the board alone cannot say comes from the author (HierarchyExport):
// the world's unit, the assemblies' names and the pieces' names. Pieces
// made from the same file are told apart by where they stand.
import * as THREE from 'three'

import { DEFAULT_MESH_COLOR } from './constants'
import { poseMatrix } from './rigid'
import type { AxisDir, BoardNode, HierarchyExport, Project, Vec3 } from '@/types/project'

export const HIERARCHY_FORMAT_VERSION = 1

/** Letters, digits, `_`, `.` and `-`: what the pipeline takes as a name. */
const NAME = /^[A-Za-z0-9_.-]+$/

export function slug(text: string): string {
  return (
    text
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'item'
  )
}

/** A file name without its extension, as a name. */
export function partNameOf(fileName: string): string {
  return slug(fileName.replace(/\.[^.]+$/, ''))
}

const AXES: Record<string, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
}

function axisVector(dir: AxisDir): THREE.Vector3 {
  return AXES[dir[1]].clone().multiplyScalar(dir[0] === '-' ? -1 : 1)
}

const nodeOf = (project: Project, id: string): BoardNode | undefined =>
  project.board.nodes.find((n) => n.id === id)

/** What goes into a node, in the order of the board's edges. */
const inputsOf = (project: Project, id: string): string[] =>
  project.board.edges.filter((e) => e.to === id).map((e) => e.from)

const isAssembly = (project: Project, id: string) => nodeOf(project, id)?.kind === 'assembly'

function describe(project: Project, id: string): string {
  const node = nodeOf(project, id)
  if (!node) return id
  if (node.kind === 'mesh') return project.meshes.find((m) => m.id === node.meshId)?.name ?? id
  return node.label?.trim() || node.kind
}

/** Where input `inputId` stands in assembly `stageId`, as a matrix in
 *  world units; null when the stage hides it. */
function memberMatrix(project: Project, stageId: string, inputId: string): THREE.Matrix4 | null {
  const member = project.stages[stageId]?.members.find((m) => m.nodeId === inputId)
  if (!member) return new THREE.Matrix4()
  if (!member.visible) return null
  return poseMatrix(member.pose)
}

// ---------- structure ----------

/** The assemblies that stand as a whole, by the node that ends their
 *  chain: those that feed no other assembly (the products), and every
 *  assembly joined with another one into a third. */
export function wholeAssemblies(project: Project): string[] {
  const assemblies = project.board.nodes.filter((n) => n.kind === 'assembly').map((n) => n.id)
  const feedsAssembly = new Set(
    project.board.edges.filter((e) => isAssembly(project, e.to)).map((e) => e.from),
  )
  const whole = assemblies.filter((id) => !feedsAssembly.has(id))
  const named = new Set(whole)
  let changed = true
  while (changed) {
    changed = false
    for (const id of assemblies) {
      const joined = inputsOf(project, id).filter((i) => isAssembly(project, i))
      if (joined.length < 2) continue
      for (const input of joined) {
        if (named.has(input)) continue
        named.add(input)
        whole.push(input)
        changed = true
      }
    }
  }
  return whole
}

export interface ChainStep {
  /** The assembly node of this stage. */
  nodeId: string
  /** What comes in at this stage: pieces, or whole sub-assemblies. */
  added: string[]
  /** This stage's world → the chain's last stage's world (world units). */
  toEnd: THREE.Matrix4
}

/** The stages of the chain that ends at `endId`, first to last. A stage's
 *  input that is an assembly but not a whole one is the stage before; a
 *  whole one is a sub-assembly coming in. Problems are added to
 *  `problems`, and the chain is null. */
export function readChain(
  project: Project,
  endId: string,
  whole: ReadonlySet<string>,
  problems: string[],
): ChainStep[] | null {
  const backwards: Array<{ nodeId: string; added: string[]; previous: string | null }> = []
  const seen = new Set<string>()
  let current: string | null = endId
  const fail = (message: string) => {
    problems.push(`${describe(project, endId)}: ${message}`)
    return null
  }
  while (current) {
    if (seen.has(current)) return fail('its chain goes round in a circle')
    seen.add(current)
    const overrides = project.stages[current]?.partOverrides ?? {}
    if (Object.keys(overrides).length) {
      return fail(
        `${describe(project, current)} moves pieces of an assembly it takes in (unlocked pieces) — lock them back`,
      )
    }
    let previous: string | null = null
    const added: string[] = []
    for (const input of inputsOf(project, current)) {
      const node = nodeOf(project, input)
      if (!node) continue
      if (memberMatrix(project, current, input) === null) {
        return fail(`${describe(project, input)} is hidden in ${describe(project, current)}`)
      }
      if (node.kind === 'mesh' || whole.has(input)) added.push(input)
      else if (node.kind === 'assembly') {
        if (previous) {
          return fail(
            `${describe(project, current)} takes two assemblies (${describe(project, previous)}, ${describe(project, input)}): it should take the stage before it and pieces`,
          )
        }
        previous = input
      }
    }
    if (!added.length) {
      return fail(`${describe(project, current)} adds no piece to the stage before it`)
    }
    backwards.push({ nodeId: current, added, previous })
    current = previous
  }
  const steps: ChainStep[] = []
  let toEnd = new THREE.Matrix4()
  for (const { nodeId, added, previous } of backwards) {
    steps.push({ nodeId, added, toEnd: toEnd.clone() })
    if (previous) toEnd = toEnd.multiply(memberMatrix(project, nodeId, previous)!)
  }
  return steps.reverse()
}

/** Where child `inputId` of `step` stands in its chain's last stage
 *  (world units, without the piece's own scale). */
export function childMatrix(project: Project, step: ChainStep, inputId: string): THREE.Matrix4 {
  return step.toEnd.clone().multiply(memberMatrix(project, step.nodeId, inputId)!)
}

// ---------- names ----------

/** The meters per world unit to start from: with every piece scaled
 *  alike, the pieces were drawn in meters and scaled to whole units. */
export function guessUnit(project: Project): number {
  const scales = new Set(project.board.nodes.filter((n) => n.kind === 'mesh').map((n) => n.scale))
  return scales.size === 1 ? 1 / [...scales][0] : 1
}

export function defaultHierarchy(project: Project): HierarchyExport {
  return { unit: guessUnit(project), forward: '-X', up: '+Y', assemblies: {}, children: {} }
}

/** Suffixes for pieces made from the same file, by where they stand
 *  (`along`: towards the front; `aside`: towards the left). */
export function placeSuffixes(at: Record<string, { along: number; aside: number }>) {
  const ids = Object.keys(at)
  const out: Record<string, string> = {}
  const byFront = [...ids].sort((a, b) => at[b].along - at[a].along)
  if (ids.length === 2) {
    const [a, b] = ids
    if (Math.abs(at[a].aside - at[b].aside) >= Math.abs(at[a].along - at[b].along)) {
      const [left, right] = [...ids].sort((p, q) => at[q].aside - at[p].aside)
      return { [left]: 'L', [right]: 'R' }
    }
    return { [byFront[0]]: 'F', [byFront[1]]: 'B' }
  }
  if (ids.length === 4) {
    for (const [prefix, pair] of [
      ['F', byFront.slice(0, 2)],
      ['R', byFront.slice(2)],
    ] as const) {
      const [left, right] = [...pair].sort((p, q) => at[q].aside - at[p].aside)
      out[left] = prefix + 'L'
      out[right] = prefix + 'R'
    }
    return out
  }
  const order = [...ids].sort((a, b) => at[b].along - at[a].along || at[b].aside - at[a].aside)
  order.forEach((id, n) => (out[id] = String(n + 1)))
  return out
}

// ---------- the hierarchy ----------

export interface HierarchyChild {
  /** Its key in HierarchyExport.children. */
  key: string
  nodeId: string
  /** The piece's or sub-assembly's name. */
  ref: string
  /** Its name in the assembly: the author's, or the one proposed. */
  id: string
  proposed: string
}

export interface HierarchyAssembly {
  nodeId: string
  name: string
  proposed: string
  /** The node of each stage, first to last. */
  stages: string[]
  stageNames: string[]
  children: HierarchyChild[]
  /** Child ids by stage. */
  sequence: string[][]
}

export interface HierarchyPart {
  name: string
  meshId: string
  /** Where its file goes, next to assembly.json. */
  path: string
}

export interface Hierarchy {
  assemblies: HierarchyAssembly[]
  parts: HierarchyPart[]
  /** `assembly.json`, ready to write. */
  document: Record<string, unknown>
  /** What keeps it from being exported. */
  problems: string[]
}

/** Each piece's bounding-box center, in its file's units, by mesh id —
 *  only needed to tell apart pieces made from the same file. */
export type MeshCenters = Record<string, Vec3>

/** Row-major 4×4, translation in meters. */
function toMeters(m: THREE.Matrix4, unit: number): number[][] {
  const e = m.elements // column-major
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => e[c * 4 + r]))
  for (let r = 0; r < 3; r++) rows[r][3] *= unit
  return rows.map((row) => row.map((v) => (Math.abs(v) < 1e-15 ? 0 : v)))
}

function hexToRgb(hex: string | null): number[] {
  const value = hex || DEFAULT_MESH_COLOR
  return [1, 3, 5].map((i) => Math.round((parseInt(value.slice(i, i + 2), 16) / 255) * 1e6) / 1e6)
}

export function buildHierarchy(
  project: Project,
  settings: HierarchyExport,
  centers: MeshCenters = {},
): Hierarchy {
  const problems: string[] = []
  if (!(settings.unit > 0)) problems.push('The world unit must be more than 0 meters.')
  const wholeIds = wholeAssemblies(project)
  const whole = new Set(wholeIds)
  if (!wholeIds.length) problems.push('There is no assembly on the board.')

  const proposedNames: Record<string, string> = {}
  const taken = new Map<string, number>()
  for (const id of wholeIds) {
    const base = slug(nodeOf(project, id)?.label || 'assembly')
    taken.set(base, (taken.get(base) ?? 0) + 1)
    proposedNames[id] = base
  }
  for (const id of wholeIds) {
    if ((taken.get(proposedNames[id]) ?? 0) > 1) proposedNames[id] += '_' + id.slice(-5)
  }
  const nameOf = (id: string) => settings.assemblies[id]?.trim() || proposedNames[id]

  const chains = new Map<string, ChainStep[]>()
  for (const id of wholeIds) {
    const chain = readChain(project, id, whole, problems)
    if (chain) chains.set(id, chain)
  }

  // the pieces: one per file, with that file's scale and color
  const parts = new Map<string, HierarchyPart & { scale: number; color: number[] }>()
  const partOfNode = new Map<string, string>()
  for (const chain of chains.values()) {
    for (const step of chain) {
      for (const input of step.added) {
        const node = nodeOf(project, input)!
        if (node.kind !== 'mesh') continue
        const mesh = project.meshes.find((m) => m.id === node.meshId)
        if (!mesh) {
          problems.push(`A piece in ${describe(project, step.nodeId)} has no file.`)
          continue
        }
        const name = partNameOf(mesh.name)
        const part = {
          name,
          meshId: mesh.id,
          path: `meshes/${name}.${mesh.ext.toLowerCase()}`,
          scale: node.scale * settings.unit,
          color: hexToRgb(node.color),
        }
        const known = parts.get(name)
        if (known && known.meshId !== mesh.id) {
          problems.push(`Two different files are called ${name}: rename one in the library.`)
        } else if (
          known &&
          (Math.abs(known.scale - part.scale) > 1e-12 || known.color.join() !== part.color.join())
        ) {
          problems.push(
            `${mesh.name} is used with different colors or scales: the pipeline takes one of each per file.`,
          )
        }
        parts.set(name, known ?? part)
        partOfNode.set(input, name)
      }
    }
  }

  // where each piece stands, in its product's frame, to tell apart the
  // ones made from the same file
  const forward = axisVector(settings.forward)
  const up = axisVector(settings.up)
  const left = up.clone().cross(forward)
  const placeOf = new Map<string, THREE.Vector3>()
  const place = (endId: string, root: THREE.Matrix4, path: Set<string>) => {
    if (path.has(endId)) return
    for (const step of chains.get(endId) ?? []) {
      for (const input of step.added) {
        const m = root.clone().multiply(childMatrix(project, step, input))
        if (whole.has(input)) place(input, m, new Set(path).add(endId))
        else {
          const node = nodeOf(project, input)!
          const c = centers[node.meshId ?? ''] ?? { x: 0, y: 0, z: 0 }
          placeOf.set(
            input,
            new THREE.Vector3(c.x, c.y, c.z).multiplyScalar(node.scale).applyMatrix4(m),
          )
        }
      }
    }
  }
  const tops = wholeIds.filter(
    (id) => !project.board.edges.some((e) => e.from === id && isAssembly(project, e.to)),
  )
  for (const id of tops) place(id, new THREE.Matrix4(), new Set())

  const assemblies: HierarchyAssembly[] = []
  const stageTaken = new Set<string>()
  const document: Record<string, unknown> = {}
  const docAssemblies: Record<string, unknown> = {}
  for (const [endId, chain] of chains) {
    const name = nameOf(endId)
    const refOf = (input: string) => (whole.has(input) ? nameOf(input) : partOfNode.get(input)!)
    const added = chain.flatMap((s) => s.added).filter((i) => refOf(i) !== undefined)
    const byRef = new Map<string, string[]>()
    for (const input of added) byRef.set(refOf(input), [...(byRef.get(refOf(input)) ?? []), input])
    const proposedIds: Record<string, string> = {}
    for (const [ref, inputs] of byRef) {
      if (inputs.length === 1) {
        proposedIds[inputs[0]] = ref
        continue
      }
      const at: Record<string, { along: number; aside: number }> = {}
      for (const input of inputs) {
        const p = placeOf.get(input) ?? new THREE.Vector3()
        at[input] = { along: p.dot(forward), aside: p.dot(left) }
      }
      for (const [input, suffix] of Object.entries(placeSuffixes(at))) {
        proposedIds[input] = `${ref}_${suffix}`
      }
    }
    const children: HierarchyChild[] = added.map((input) => {
      const key = `${endId}/${input}`
      const proposed = proposedIds[input]
      return {
        key,
        nodeId: input,
        ref: refOf(input),
        id: settings.children[key]?.trim() || proposed,
        proposed,
      }
    })
    const idOf = new Map(children.map((c) => [c.nodeId, c.id]))
    const sequence = chain.map((step) =>
      step.added.filter((i) => idOf.has(i)).map((i) => idOf.get(i)!),
    )
    // (named after their nodes; the pipeline finds a stage by its name, so
    // one that is taken anywhere in the file gets a number)
    const stageNames = chain.map((step, k) => {
      const label = nodeOf(project, step.nodeId)?.label?.trim()
      const base = label ? slug(label) : `${name}_s${k + 1}`
      let stage = base
      for (let n = 2; stageTaken.has(stage); n++) stage = `${base}_${n}`
      stageTaken.add(stage)
      return stage
    })
    const where = `Assembly ${name}`
    if (!NAME.test(name)) problems.push(`${where}: a name may only have letters, digits, _ . -`)
    for (const child of children) {
      if (!NAME.test(child.id)) {
        problems.push(`${where}: the piece name "${child.id}" may only have letters, digits, _ . -`)
      }
    }
    const ids = children.map((c) => c.id)
    for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
      problems.push(`${where}: two of its pieces are called ${id}.`)
    }
    assemblies.push({
      nodeId: endId,
      name,
      proposed: proposedNames[endId],
      stages: chain.map((step) => step.nodeId),
      stageNames,
      children,
      sequence,
    })
    docAssemblies[name] = {
      children: children.map((c) => {
        const step = chain.find((s) => s.added.includes(c.nodeId))!
        return {
          id: c.id,
          ref: c.ref,
          T: toMeters(childMatrix(project, step, c.nodeId), settings.unit),
        }
      }),
      sequence,
      stage_names: stageNames,
    }
  }
  const names = assemblies.map((a) => a.name)
  for (const name of new Set(names.filter((n, i) => names.indexOf(n) !== i))) {
    problems.push(`Two assemblies are called ${name}.`)
  }
  for (const name of names) {
    if (parts.has(name)) problems.push(`${name} is the name of both a piece and an assembly.`)
  }

  const docParts: Record<string, unknown> = {}
  for (const part of parts.values()) {
    docParts[part.name] = {
      path: part.path,
      scale_to_meters: part.scale,
      color: part.color,
      keypoints: null,
    }
  }
  Object.assign(document, {
    format_version: HIERARCHY_FORMAT_VERSION,
    units: 'meters',
    generated_by: 'Mesh Studio',
    project: project.name,
    parts: docParts,
    assemblies: docAssemblies,
  })
  return {
    assemblies,
    parts: [...parts.values()].map(({ name, meshId, path }) => ({ name, meshId, path })),
    document,
    problems,
  }
}
