// Built-in environments: backdrops that are never seen themselves, only
// in the soft light and the reflections they give the pieces. Made in
// code (no image files to ship or load) and prefiltered for three's
// physically based materials.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import type { EnvironmentPreset } from '@/types/project'

interface Gradient {
  /** Colors from straight down to straight up. */
  stops: Array<[number, number]>
  /** A bright patch (the sun): direction, color, size. */
  sun?: { at: [number, number, number]; color: number; strength: number; size: number }
}

const GRADIENTS: Record<Exclude<EnvironmentPreset, 'studio'>, Gradient> = {
  sky: {
    stops: [
      [0, 0x6f6a60],
      [0.48, 0xbfc6cc],
      [0.56, 0xdfeaf5],
      [1, 0x4f8fd8],
    ],
    sun: { at: [0.5, 0.8, 0.3], color: 0xfff4dd, strength: 14, size: 0.9 },
  },
  sunset: {
    stops: [
      [0, 0x2a2430],
      [0.47, 0x6b4a4a],
      [0.54, 0xffa25c],
      [0.7, 0xc86a78],
      [1, 0x2c3566],
    ],
    sun: { at: [0.9, 0.12, -0.3], color: 0xffb060, strength: 18, size: 1.1 },
  },
}

function gradientScene({ stops, sun }: Gradient): THREE.Scene {
  const scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(10, 48, 24)
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const a = new THREE.Color()
  const b = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) / 10 + 1) / 2
    let k = 0
    while (k < stops.length - 2 && h > stops[k + 1][0]) k++
    const [h0, c0] = stops[k]
    const [h1, c1] = stops[k + 1]
    const u = THREE.MathUtils.clamp((h - h0) / (h1 - h0 || 1), 0, 1)
    a.set(c0).lerp(b.set(c1), u)
    colors.set([a.r, a.g, a.b], i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  scene.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }),
    ),
  )
  if (sun) {
    const disc = new THREE.Mesh(
      new THREE.SphereGeometry(sun.size, 16, 16),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(sun.color).multiplyScalar(sun.strength),
      }),
    )
    disc.position.set(...sun.at).setLength(8)
    scene.add(disc)
  }
  return scene
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
  })
}

/** The prefiltered environment map of a preset (the caller disposes it). */
export function buildEnvironment(
  renderer: THREE.WebGLRenderer,
  preset: EnvironmentPreset,
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = preset === 'studio' ? new RoomEnvironment() : gradientScene(GRADIENTS[preset])
  const texture = pmrem.fromScene(scene, 0.04).texture
  if (scene instanceof RoomEnvironment) scene.dispose()
  else disposeScene(scene)
  pmrem.dispose()
  return texture
}
