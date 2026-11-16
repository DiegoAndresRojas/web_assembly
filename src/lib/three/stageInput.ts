// Builds the three.js object for one stage input: a mesh node's file, or
// an upstream assembly's result — every visible part of that assembly,
// posed exactly as it was assembled, grouped into one rigid object (nested
// assemblies recurse). The group's own origin is the upstream stage's world
// origin, so at an identity pose it sits exactly where it was assembled.
import * as THREE from 'three'

import { membersOf } from '@/lib/graph'
import { applyColor, applyOpacity, applyPose, buildMesh } from './buildMesh'
import type { MembersRow, Project, StageMember } from '@/types/project'

const IDENTITY = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }

async function buildStageOutput(
  project: Project,
  stageId: string,
  path: Set<string>,
): Promise<THREE.Group> {
  const group = new THREE.Group()
  group.name = stageId
  // the board forbids cycles, but never recurse forever on stale data
  if (path.has(stageId)) return group
  const nextPath = new Set(path).add(stageId)
  const stage = project.stages[stageId]

  const parts = await Promise.all(
    membersOf(project, stageId).map(async (row) => {
      // a stage never opened yet has no member records: its inputs sit at
      // the default (identity) pose, which is also how opening it lays them out
      const member: Partial<StageMember> =
        stage?.members.find((m) => m.nodeId === row.node.id) ?? {}
      if (member.visible === false) return null
      const obj = row.mesh
        ? await buildMesh(row.mesh)
        : await buildStageOutput(project, row.node.id, nextPath)
      applyPose(obj, member.pose ?? IDENTITY)
      if (row.mesh) obj.scale.setScalar(row.node.scale ?? 1)
      applyColor(obj, member.color ?? row.node.color)
      obj.userData.msNodeId = row.node.id
      if (member.opacity !== undefined) applyOpacity(obj, member.opacity)
      return obj
    }),
  )
  for (const part of parts) if (part) group.add(part)
  return group
}

export function buildInput(project: Project, row: MembersRow): Promise<THREE.Object3D> {
  return row.mesh ? buildMesh(row.mesh) : buildStageOutput(project, row.node.id, new Set())
}
