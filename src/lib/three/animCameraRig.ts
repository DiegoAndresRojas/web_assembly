// The animation camera as an object in the world, separate from the
// viewport camera the user works with: a real PerspectiveCamera (what the
// animation is seen / exported through) plus a visible body — box, lens,
// film reels, the view pyramid and an "up" marker — so it can be seen,
// picked and moved like any piece. The camera track poses `root`.
import * as THREE from 'three'

const BODY = 0x5d4fb0
const DARK = 0x2a2640
const LINE = 0xb5abfc
/** The animation camera always frames 16:9 — what video export records. */
export const ANIM_ASPECT = 16 / 9
/** How far the view pyramid reaches, in body units. */
const PYRAMID_DEPTH = 2.2

export class AnimCameraRig {
  /** Posed by the camera track (position + rotation, never scaled). */
  readonly root = new THREE.Group()
  /** What "look through" and video export render with. */
  readonly camera: THREE.PerspectiveCamera
  /** Body + pyramid, scaled to stay readable at the scene's size. */
  readonly visual = new THREE.Group()
  private pyramid: THREE.LineSegments

  constructor(fov = 50) {
    this.root.name = 'animation-camera'
    this.root.visible = false
    this.camera = new THREE.PerspectiveCamera(fov, ANIM_ASPECT, 0.05, 500)
    this.root.add(this.camera, this.visual)

    const body = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.5, metalness: 0.2 })
    const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6 })
    const add = (mesh: THREE.Mesh) => {
      mesh.userData.msAnimCamera = true
      this.visual.add(mesh)
      return mesh
    }
    // the camera looks down -Z: body behind the origin, lens in front
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.8), body)).position.set(0, 0, 0.42)
    const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.34, 24), dark))
    lens.rotation.x = Math.PI / 2
    lens.position.z = -0.12
    for (const z of [0.2, 0.68]) {
      const reel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 24), dark))
      reel.rotation.z = Math.PI / 2
      reel.position.set(0, 0.56, z)
    }

    this.pyramid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.85 }),
    )
    this.visual.add(this.pyramid)
    this.setAspect(ANIM_ASPECT)
  }

  /** Sets the frame aspect and redraws the view pyramid to it. */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    const d = PYRAMID_DEPTH
    const hh = d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const hw = hh * aspect
    const c = [
      [-hw, hh],
      [hw, hh],
      [hw, -hh],
      [-hw, -hh],
    ]
    const pts: number[] = []
    for (const [x, y] of c) pts.push(0, 0, 0, x, y, -d) // edges from the eye
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = c[i]
      const [x2, y2] = c[(i + 1) % 4]
      pts.push(x1, y1, -d, x2, y2, -d) // image rectangle
    }
    // "up" triangle above the image
    pts.push(-hw * 0.3, hh * 1.08, -d, 0, hh * 1.4, -d, 0, hh * 1.4, -d, hw * 0.3, hh * 1.08, -d)
    pts.push(hw * 0.3, hh * 1.08, -d, -hw * 0.3, hh * 1.08, -d)
    this.pyramid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.pyramid.geometry.computeBoundingSphere()
  }

  /** Visual size (the body is ~1 unit before scaling). */
  setSize(size: number): void {
    this.visual.scale.setScalar(size)
  }

  setClip(near: number, far: number): void {
    this.camera.near = near
    this.camera.far = far
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.visual.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      }
    })
  }
}
