// A stage light as an object in the world: the three.js light itself plus
// a small body that can be seen, picked and moved like any piece (ambient
// lights have neither a place nor a body). `root` is what gets posed; the
// light shines down its -Z, like the animation camera looks.
import * as THREE from 'three'

import type { LightKind, StageLight } from '@/types/project'

const GROUND = 0x1a1a22
const OFF = 0x6b6880
/** How far the direction marks reach, in body units. */
const REACH = 2.4

function segments(points: number[], material: THREE.LineBasicMaterial): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return new THREE.LineSegments(geometry, material)
}

/** Lines from the origin down -Z along a cone of half-angle `deg`, closed
 *  by the circle they reach. */
function conePoints(deg: number): number[] {
  const r = Math.tan(THREE.MathUtils.degToRad(Math.min(deg, 80))) * REACH
  const pts: number[] = []
  const steps = 32
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const b = ((i + 1) / steps) * Math.PI * 2
    pts.push(Math.cos(a) * r, Math.sin(a) * r, -REACH, Math.cos(b) * r, Math.sin(b) * r, -REACH)
    if (i % 8 === 0) pts.push(0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, -REACH)
  }
  return pts
}

type ShadowLight = THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight

function castsShadows(light: THREE.Light): light is ShadowLight {
  return (
    light instanceof THREE.DirectionalLight ||
    light instanceof THREE.SpotLight ||
    light instanceof THREE.PointLight
  )
}

export class LightRig {
  /** Posed by the light's pose / track (never scaled). */
  readonly root = new THREE.Group()
  /** The body and direction marks, scaled to stay readable at the scene's size. */
  readonly visual = new THREE.Group()
  readonly light: THREE.Light
  readonly kind: LightKind
  private bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  private lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
  })
  private cone: THREE.LineSegments | null = null
  private coneAngle = 0
  private on = true
  private intensity = 1

  constructor(kind: LightKind) {
    this.kind = kind
    this.root.name = 'light-' + kind
    this.light = this.makeLight()
    this.root.add(this.light)
    if (kind !== 'ambient') {
      this.root.add(this.visual)
      this.buildBody()
    }
  }

  private makeLight(): THREE.Light {
    if (this.kind === 'ambient') return new THREE.HemisphereLight(0xffffff, GROUND, 1)
    if (this.kind === 'point') {
      // (no physical falloff: pieces come in any unit, from millimeters to
      // meters, and a falloff tied to distance would make "1" mean nothing)
      return new THREE.PointLight(0xffffff, 1, 0, 0)
    }
    const light =
      this.kind === 'spot'
        ? new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 6, 0.4, 0)
        : new THREE.DirectionalLight(0xffffff, 1)
    // aims wherever the root is turned to
    light.target.position.set(0, 0, -1)
    this.root.add(light.target)
    return light
  }

  private buildBody(): void {
    const pickable = (mesh: THREE.Mesh) => {
      mesh.userData.msLight = true
      this.visual.add(mesh)
      return mesh
    }
    // a generous invisible target, so the small body is easy to click
    pickable(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 12),
        new THREE.MeshBasicMaterial({ visible: false }),
      ),
    )
    if (this.kind === 'spot') {
      // a lamp shade: narrow end at the origin, opening down -Z
      const shade = pickable(
        new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 24, 1, true), this.bodyMaterial),
      )
      this.bodyMaterial.side = THREE.DoubleSide
      shade.rotation.x = Math.PI / 2
      shade.position.z = -0.3
      return
    }
    pickable(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 20), this.bodyMaterial))
    if (this.kind === 'directional') {
      // parallel rays, with a head on the middle one
      const pts: number[] = []
      for (const [x, y] of [
        [0, 0],
        [0.45, 0],
        [-0.45, 0],
        [0, 0.45],
        [0, -0.45],
      ]) {
        pts.push(x, y, -0.5, x, y, x || y ? -1.5 : -REACH)
      }
      pts.push(0, 0, -REACH, 0.14, 0, -REACH + 0.3, 0, 0, -REACH, -0.14, 0, -REACH + 0.3)
      this.visual.add(segments(pts, this.lineMaterial))
    } else {
      // short rays all around
      const pts: number[] = []
      for (const [x, y, z] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        pts.push(x * 0.45, y * 0.45, z * 0.45, x * 0.8, y * 0.8, z * 0.8)
      }
      this.visual.add(segments(pts, this.lineMaterial))
    }
  }

  /** Whether it has a place in the world (and so can be picked and moved). */
  get posed(): boolean {
    return this.kind !== 'ambient'
  }

  /** Everything about the light but where it is and how bright (see
   *  setIntensity; the root is posed by the caller). */
  update(spec: StageLight): void {
    const { light } = this
    this.on = spec.visible
    light.color.set(spec.color)
    const shown = new THREE.Color(spec.visible ? spec.color : OFF)
    this.bodyMaterial.color.copy(shown)
    this.lineMaterial.color.copy(shown)
    this.lineMaterial.opacity = spec.visible ? 0.75 : 0.35
    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      light.distance = spec.distance
    }
    if (light instanceof THREE.SpotLight) {
      light.angle = THREE.MathUtils.degToRad(spec.angle)
      light.penumbra = spec.penumbra
      if (spec.angle !== this.coneAngle) {
        this.coneAngle = spec.angle
        if (this.cone) {
          this.visual.remove(this.cone)
          this.cone.geometry.dispose()
        }
        this.cone = segments(conePoints(spec.angle), this.lineMaterial)
        this.visual.add(this.cone)
      }
    }
    if (castsShadows(light)) {
      light.castShadow = spec.castShadow
      const size = light instanceof THREE.PointLight ? 1024 : 2048
      if (light.shadow.mapSize.x !== size) light.shadow.mapSize.set(size, size)
    }
    this.setIntensity(this.intensity)
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity
    this.light.intensity = this.on ? intensity : 0
  }

  get castsShadow(): boolean {
    return this.on && this.light.castShadow
  }

  /** Visual size (the body is ~1 unit before scaling). */
  setSize(size: number): void {
    this.visual.scale.setScalar(size)
  }

  /** Makes the shadow this light casts cover the pieces — a sphere at
   *  `center` — and reach what lies behind them. */
  fitShadow(center: THREE.Vector3, radius: number): void {
    const { light } = this
    if (!castsShadows(light)) return
    const shadow = light.shadow
    // in world units: pieces come at any scale
    shadow.normalBias = radius * 0.004
    shadow.bias = -0.0004
    const eye = this.root.getWorldPosition(new THREE.Vector3())
    if (light instanceof THREE.DirectionalLight) {
      // the pieces as the shadow camera sees them (it sits on the light,
      // looking at its target, world-up)
      const target = light.target.getWorldPosition(new THREE.Vector3())
      const view = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0))
      view.setPosition(eye)
      const local = center.clone().applyMatrix4(view.invert())
      const cam = light.shadow.camera
      const r = radius * 1.15
      cam.left = local.x - r
      cam.right = local.x + r
      cam.top = local.y + r
      cam.bottom = local.y - r
      cam.near = -local.z - r
      cam.far = -local.z + r * 6
      cam.updateProjectionMatrix()
      return
    }
    const cam = shadow.camera as THREE.PerspectiveCamera
    cam.near = Math.max(radius / 100, 1e-4)
    cam.far = eye.distanceTo(center) + radius * 6
    cam.updateProjectionMatrix()
  }

  dispose(): void {
    this.visual.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose()
    })
    this.bodyMaterial.dispose()
    this.lineMaterial.dispose()
    this.light.dispose()
  }
}
