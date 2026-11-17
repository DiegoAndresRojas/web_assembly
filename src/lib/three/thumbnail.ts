// Small pictures of mesh files, for the library, the board and the project
// cards. One renderer of its own, off screen, shared by every picture.
import * as THREE from 'three'

import { applyColor, buildMesh, forgetParsedMesh, isParsed, releaseObject } from './buildMesh'
import type { MeshRecord } from '@/types/project'

const SIZE = 192
const FOV = 28

let renderer: THREE.WebGLRenderer | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer
  const created = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  created.setPixelRatio(1)
  created.setSize(SIZE, SIZE, false)
  created.setClearColor(0x000000, 0)
  // a lost context is not coming back: start over on the next picture
  created.domElement.addEventListener('webglcontextlost', () => {
    if (renderer === created) renderer = null
  })
  renderer = created
  return created
}

/** A picture of the mesh on a transparent background, as a PNG data URL:
 *  seen from above and to one side, filling the frame whatever its size. */
export async function renderThumbnail(mesh: MeshRecord, color: string | null): Promise<string> {
  // a file read only for its picture is not kept in memory afterwards
  const wasParsed = isParsed(mesh)
  const object = await buildMesh(mesh)
  try {
    if (color) applyColor(object, color)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3850, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(0.6, 1, 0.8)
    scene.add(sun, object)

    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 1e-6)
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.04
    const camera = new THREE.PerspectiveCamera(FOV, 1, distance / 100, distance * 4)
    camera.position
      .copy(sphere.center)
      .add(new THREE.Vector3(0.62, 0.48, 0.62).normalize().multiplyScalar(distance))
    camera.lookAt(sphere.center)

    const target = getRenderer()
    target.render(scene, camera)
    return target.domElement.toDataURL('image/png')
  } finally {
    releaseObject(object)
    if (!wasParsed) forgetParsedMesh(mesh)
  }
}
