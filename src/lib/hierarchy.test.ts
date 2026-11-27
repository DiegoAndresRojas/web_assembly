import { describe, expect, it } from 'vitest'

import {
  buildHierarchy,
  defaultHierarchy,
  guessUnit,
  placeSuffixes,
  slug,
  wholeAssemblies,
} from './hierarchy'
import { normalizeHierarchy, normalizeProject } from './migrations'
import type { HierarchyExport, Project } from '@/types/project'

const at = (x: number, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => ({
  pos: { x, y, z },
  rot: { x: rx, y: ry, z: rz },
})
const member = (nodeId: string, pose = at(0), visible = true) => ({
  nodeId,
  visible,
  opacity: 1,
  pose,
})

/** A small truck, drawn in meters and scaled ×100 (the world is in cm):
 *
 *    cab1 (chassis, wheel×2) → cab2 (+ roof)          = the cab
 *    bed1 (bed)                                       = the bed assembly
 *    truck (cab, bed, wheel×2)                        = the truck
 *
 *  Forward is -X: the front wheels have the smaller x; left is +Z. */
function truck(over: { stages?: Record<string, unknown>; edges?: unknown[] } = {}): Project {
  const piece = (id: string, meshId: string, color = '#ff0000') => ({
    id,
    kind: 'mesh',
    meshId,
    scale: 100,
    color,
  })
  return normalizeProject({
    name: 'Truck',
    meshes: [
      { id: 'm-chassis', name: 'Chassis.stl', ext: 'stl' },
      { id: 'm-wheel', name: 'roda.stl', ext: 'STL' },
      { id: 'm-roof', name: 'Roof Top.stl', ext: 'stl' },
      { id: 'm-bed', name: 'bed.obj', ext: 'obj' },
    ],
    board: {
      nodes: [
        piece('chassis', 'm-chassis'),
        piece('w1', 'm-wheel', '#000000'),
        piece('w2', 'm-wheel', '#000000'),
        piece('roof', 'm-roof'),
        piece('bed', 'm-bed'),
        piece('w3', 'm-wheel', '#000000'),
        piece('w4', 'm-wheel', '#000000'),
        { id: 'cab1', kind: 'assembly', label: 'Cab 1' },
        { id: 'cab2', kind: 'assembly', label: 'Cab' },
        { id: 'bed1', kind: 'assembly', label: 'Bed assembly' },
        { id: 'truck', kind: 'assembly', label: 'Truck' },
        { id: 'anim', kind: 'animation' },
      ],
      edges: over.edges ?? [
        { id: 'e1', from: 'chassis', to: 'cab1' },
        { id: 'e2', from: 'w1', to: 'cab1' },
        { id: 'e3', from: 'w2', to: 'cab1' },
        { id: 'e4', from: 'cab1', to: 'cab2' },
        { id: 'e5', from: 'roof', to: 'cab2' },
        { id: 'e6', from: 'bed', to: 'bed1' },
        { id: 'e7', from: 'cab2', to: 'truck' },
        { id: 'e8', from: 'bed1', to: 'truck' },
        { id: 'e9', from: 'w3', to: 'truck' },
        { id: 'e10', from: 'w4', to: 'truck' },
        { id: 'e11', from: 'truck', to: 'anim' },
      ],
    },
    stages: over.stages ?? {
      cab1: {
        kind: 'assembly',
        members: [
          member('chassis'),
          member('w1', at(-10, 0, 5)), // front left
          member('w2', at(-10, 0, -5)), // front right
        ],
      },
      cab2: {
        kind: 'assembly',
        // the cab as it came, moved 2 cm up; the roof on top
        members: [member('cab1', at(0, 2, 0)), member('roof', at(0, 10, 0))],
      },
      bed1: { kind: 'assembly', members: [member('bed')] },
      truck: {
        kind: 'assembly',
        members: [
          member('cab2', at(-20, 0, 0)),
          member('bed1', at(20, 0, 0, 0, 90, 0)),
          member('w3', at(30, 0, -5)), // rear right
          member('w4', at(30, 0, 5)), // rear left
        ],
      },
    },
  })!
}

const settings = (over: Partial<HierarchyExport> = {}): HierarchyExport => ({
  ...defaultHierarchy(truck()),
  ...over,
})

type Doc = {
  parts: Record<string, { path: string; scale_to_meters: number; color: number[] }>
  assemblies: Record<
    string,
    {
      children: Array<{ id: string; ref: string; T: number[][] }>
      sequence: string[][]
      stage_names: string[]
    }
  >
}

describe('hierarchy', () => {
  it('finds the products and the sub-assemblies joined into them', () => {
    expect(new Set(wholeAssemblies(truck()))).toEqual(new Set(['truck', 'cab2', 'bed1']))
  })

  it('guesses the unit from the pieces’ common scale', () => {
    expect(guessUnit(truck())).toBeCloseTo(0.01)
    expect(settings()).toMatchObject({ forward: '-X', up: '+Y' })
  })

  it('writes the pieces once each, in meters, with their color', () => {
    const h = buildHierarchy(truck(), settings())
    expect(h.problems).toEqual([])
    const doc = h.document as unknown as Doc
    expect(Object.keys(doc.parts).sort()).toEqual(['bed', 'chassis', 'roda', 'roof_top'])
    expect(doc.parts.roda).toEqual({
      path: 'meshes/roda.stl',
      scale_to_meters: 1,
      color: [0, 0, 0],
      keypoints: null,
    })
    expect(doc.parts.chassis.color).toEqual([1, 0, 0])
    expect(h.document).toMatchObject({ format_version: 1, units: 'meters' })
  })

  it('reads each chain as one assembly with a stage per node', () => {
    const doc = buildHierarchy(truck(), settings()).document as unknown as Doc
    expect(Object.keys(doc.assemblies).sort()).toEqual(['bed_assembly', 'cab', 'truck'])
    const cab = doc.assemblies.cab
    expect(cab.stage_names).toEqual(['cab_1', 'cab'])
    expect(cab.sequence).toEqual([['chassis', 'roda_L', 'roda_R'], ['roof_top']])
    const truckAsm = doc.assemblies.truck
    expect(truckAsm.sequence).toEqual([['cab', 'bed_assembly', 'roda_R', 'roda_L']])
    expect(truckAsm.children.map((c) => c.ref)).toEqual(['cab', 'bed_assembly', 'roda', 'roda'])
  })

  it('composes the stages before into each child’s transform, in meters', () => {
    const doc = buildHierarchy(truck(), settings()).document as unknown as Doc
    const T = (asm: string, id: string) => doc.assemblies[asm].children.find((c) => c.id === id)!.T
    // a piece of the first stage moves with the cab as later stages place it
    expect(T('cab', 'chassis')[1][3]).toBeCloseTo(0.02)
    expect(T('cab', 'roda_L')[0][3]).toBeCloseTo(-0.1)
    expect(T('cab', 'roda_L')[2][3]).toBeCloseTo(0.05)
    // the piece added last is where its own stage put it
    expect(T('cab', 'roof_top')[1][3]).toBeCloseTo(0.1)
    // a sub-assembly, turned 90° about Y
    const bed = T('truck', 'bed_assembly')
    expect(bed[0][3]).toBeCloseTo(0.2)
    expect(bed[0][2]).toBeCloseTo(1)
    expect(bed[2][0]).toBeCloseTo(-1)
    expect(bed[3]).toEqual([0, 0, 0, 1])
  })

  it('tells repeated pieces apart by where they stand', () => {
    const four = placeSuffixes({
      a: { along: 1, aside: 1 },
      b: { along: 1, aside: -1 },
      c: { along: -1, aside: 1 },
      d: { along: -1, aside: -1 },
    })
    expect(four).toEqual({ a: 'FL', b: 'FR', c: 'RL', d: 'RR' })
    expect(placeSuffixes({ a: { along: 2, aside: 0 }, b: { along: -2, aside: 0 } })).toEqual({
      a: 'F',
      b: 'B',
    })
    expect(
      Object.values(
        placeSuffixes({
          a: { along: 3, aside: 0 },
          b: { along: 2, aside: 0 },
          c: { along: 1, aside: 0 },
        }),
      ),
    ).toEqual(['1', '2', '3'])
    // with forward +X, left and right swap
    const doc = buildHierarchy(truck(), settings({ forward: '+X' })).document as unknown as Doc
    expect(doc.assemblies.truck.sequence).toEqual([['cab', 'bed_assembly', 'roda_L', 'roda_R']])
    expect(doc.assemblies.cab.children.find((c) => c.id === 'roda_R')!.T[2][3]).toBeCloseTo(0.05)
  })

  it('uses the names the author gave', () => {
    const h = buildHierarchy(
      truck(),
      settings({
        assemblies: { truck: 'a3_camion', cab2: 'a1_cabine' },
        children: { 'truck/w3': 'roda_RR', 'truck/w4': 'roda_RL', 'truck/cab2': 'cabine' },
      }),
    )
    expect(h.problems).toEqual([])
    const doc = h.document as unknown as Doc
    expect(Object.keys(doc.assemblies).sort()).toEqual(['a1_cabine', 'a3_camion', 'bed_assembly'])
    expect(doc.assemblies.a3_camion.sequence).toEqual([
      ['cabine', 'bed_assembly', 'roda_RR', 'roda_RL'],
    ])
    expect(doc.assemblies.a3_camion.children[0].ref).toBe('a1_cabine')
    const truckAsm = h.assemblies.find((a) => a.nodeId === 'truck')!
    expect(truckAsm.children.find((c) => c.nodeId === 'w3')).toMatchObject({
      id: 'roda_RR',
      proposed: 'roda_R',
    })
  })

  it('says what keeps it from being exported', () => {
    const bad = (s: Partial<HierarchyExport>) => buildHierarchy(truck(), settings(s)).problems
    expect(bad({ children: { 'truck/w3': 'roda_L' } })).toEqual([
      'Assembly truck: two of its pieces are called roda_L.',
    ])
    expect(bad({ assemblies: { cab2: 'bed_assembly' } })).toEqual([
      'Two assemblies are called bed_assembly.',
    ])
    expect(bad({ assemblies: { truck: 'roda' } })).toEqual([
      'roda is the name of both a piece and an assembly.',
    ])
    expect(bad({ assemblies: { truck: 'my truck' } })[0]).toMatch(/letters, digits/)
    expect(bad({ unit: 0 })[0]).toMatch(/unit/)
  })

  it('refuses what the hierarchy cannot hold', () => {
    const project = truck()
    project.stages.cab2.members.find((m) => m.nodeId === 'roof')!.visible = false
    expect(buildHierarchy(project, settings()).problems[0]).toMatch(/hidden/)

    const unlocked = truck()
    unlocked.stages.truck.partOverrides = { 'cab2/roof': { free: true, pose: at(0) } }
    expect(buildHierarchy(unlocked, settings()).problems[0]).toMatch(/unlocked/)

    const empty = truck()
    empty.board.edges = empty.board.edges.filter((e) => e.from !== 'roof')
    expect(buildHierarchy(empty, settings()).problems[0]).toMatch(/adds no piece/)
  })

  it('keeps the export settings through a save', () => {
    expect(normalizeHierarchy(null)).toBeNull()
    expect(
      normalizeHierarchy({ unit: -1, forward: '+Y', up: '+Y', assemblies: { a: ' x ', b: 3 } }),
    ).toEqual({ unit: 1, forward: '-X', up: '+Y', assemblies: { a: 'x' }, children: {} })
    const saved = normalizeProject({ ...truck(), hierarchy: settings({ unit: 0.001 }) })!
    expect(saved.hierarchy?.unit).toBe(0.001)
    expect(truck().hierarchy).toBeNull()
  })

  it('numbers stages that share a name', () => {
    const project = truck()
    project.board.nodes.find((n) => n.id === 'cab2')!.label = 'Cab 1'
    project.board.nodes.find((n) => n.id === 'bed1')!.label = 'Cab 1'
    const h = buildHierarchy(project, settings({ assemblies: { cab2: 'cab', bed1: 'bed_asm' } }))
    expect(h.problems).toEqual([])
    const names = h.assemblies.flatMap((a) => a.stageNames)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('cab_1_2')
  })

  it('makes names the pipeline takes', () => {
    expect(slug(' Roof Top! ')).toBe('roof_top')
    expect(slug('ã')).toBe('item')
  })
})
