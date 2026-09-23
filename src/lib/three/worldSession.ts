// Owns the three.js side of the 3D viewport: renderer, camera rig, render
// loop and pointer picking. Everything here is imperative (mutates a live
// scene) — hooks/useWorldSession.ts is the only caller, and it is the
// bridge back to React state. Typed port of
// only_js/src/composables/useWorldSession.js (now a class, and three.js is
// a static import instead of a lazily-loaded esm.sh module).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

import { applyPose } from './buildMesh'
import type { Pose, Vec3 } from '@/types/project'

const CLICK_SLOP = 6

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface PickHit {
  nodeId: string
  point: Vec3
  normal: Vec3
}

export interface WorldSessionOptions {
  onReady?: () => void
  onPick?: (hit: PickHit | null) => void
  onFrame?: (dt: number) => void
}

export class WorldSession {
  objects = new Map<string, THREE.Object3D>()
  selectedId: string | null = null
  gizmo: TransformControls | null = null
  scene: THREE.Scene | null = null
  camera: THREE.PerspectiveCamera | null = null
  renderer: THREE.WebGLRenderer | null = null
  controls: OrbitControls | null = null

  private disposed = false
  private raf: number | null = null
  private resizeObserver: ResizeObserver | null = null
  private container: HTMLElement
  private opts: WorldSessionOptions

  constructor(container: HTMLElement, opts: WorldSessionOptions) {
    this.container = container
    this.opts = opts
    this.boot()
  }

  private boot(): void {
    const container = this.container
    const opts = this.opts

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x161826)
    this.scene = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500)
    camera.position.set(4, 3, 5)
    this.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(4, 6, 4)
    scene.add(dir)
    scene.add(new THREE.GridHelper(20, 20, 0x3a3752, 0x24223a))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    this.controls = controls

    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setMode('translate')
    gizmo.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value
    })
    scene.add(gizmo.getHelper())
    this.gizmo = gizmo

    const resize = () => {
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(resize)
      this.resizeObserver.observe(container)
    } else {
      window.addEventListener('resize', resize)
    }

    this.wirePicking(renderer.domElement, camera)

    const clock = new THREE.Clock()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = clock.getDelta()
      controls.update()
      opts.onFrame?.(dt)
      renderer.render(scene, camera)
    }
    loop()

    opts.onReady?.()
  }

  private wirePicking(dom: HTMLElement, camera: THREE.PerspectiveCamera): void {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null

    const toNdc = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY }
    })
    dom.addEventListener('pointerup', (e) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > CLICK_SLOP || !this.opts.onPick) return
      toNdc(e)
      raycaster.setFromCamera(ndc, camera)

      let best: { id: string; hit: THREE.Intersection } | null = null
      for (const [id, obj] of this.objects) {
        const hits = raycaster.intersectObject(obj, true)
        if (hits.length && (!best || hits[0].distance < best.hit.distance)) {
          best = { id, hit: hits[0] }
        }
      }
      if (!best) {
        this.opts.onPick(null)
        return
      }
      const p = best.hit.point
      const n = best.hit.face
        ? best.hit.face.normal.clone().transformDirection(best.hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0)
      this.opts.onPick({
        nodeId: best.id,
        point: { x: p.x, y: p.y, z: p.z },
        normal: { x: n.x, y: n.y, z: n.z },
      })
    })
  }

  addObject(id: string, object3d: THREE.Object3D): void {
    if (!this.scene) return
    this.objects.set(id, object3d)
    this.scene.add(object3d)
  }

  removeObject(id: string): void {
    const obj = this.objects.get(id)
    if (!obj) return
    if (this.selectedId === id) this.setSelected(null)
    this.objects.delete(id)
    this.scene?.remove(obj)
  }

  getObject(id: string): THREE.Object3D | null {
    return this.objects.get(id) ?? null
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    if (!this.gizmo) return
    const obj = id ? this.objects.get(id) : null
    if (obj) this.gizmo.attach(obj)
    else this.gizmo.detach()
  }

  setMode(mode: GizmoMode): void {
    this.gizmo?.setMode(mode)
  }

  private pickMarkers: THREE.Object3D[] = []

  /** Small glowing spheres at each pending keypoint pick — the only
   *  feedback the user gets that a click actually registered before a
   *  second point completes the link. Not part of `objects`, so they're
   *  never raycast-picked themselves. */
  setPickMarkers(points: Vec3[]): void {
    if (!this.scene) return
    for (const m of this.pickMarkers) this.scene.remove(m)
    this.pickMarkers = points.map((p) => {
      const pos = new THREE.Vector3(p.x, p.y, p.z)
      const radius = this.markerRadiusAt(pos)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x968ae0, depthTest: false }),
      )
      marker.position.copy(pos)
      marker.renderOrder = 999
      this.scene!.add(marker)
      return marker
    })
  }

  /** A marker radius sized as a fraction of the camera's distance to the
   *  point, not the object's own scale — meshes are authored in any unit
   *  (millimeters to meters), so a world-unit size or a size derived from
   *  the scene's bounding sphere either disappears or swallows the whole
   *  view depending on how frameAll() last positioned the camera. Screen
   *  space is the one thing that stays comparable across all of that. */
  private markerRadiusAt(point: THREE.Vector3): number {
    if (!this.camera) return 0.02
    return Math.max(this.camera.position.distanceTo(point) * 0.01, this.camera.near * 0.5)
  }

  frameAll(): void {
    if (!this.camera || !this.controls) return
    const box = new THREE.Box3()
    let any = false
    this.objects.forEach((obj) => {
      box.expandByObject(obj)
      any = true
    })
    if (!any) return
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    // Loaded meshes can be authored at any scale (millimeters, meters,
    // kilometers…), so the camera's clip planes and framing distance are
    // rescaled to match the actual geometry each time instead of assuming
    // a fixed real-world size — a 3-unit minimum distance made anything
    // smaller than ~1 unit across unpickable and, worse, could sit past
    // a fixed near plane and clip entirely.
    const radius = Math.max(sphere.radius, 1e-4)
    this.camera.near = Math.max(radius / 200, 1e-4)
    this.camera.far = Math.max(radius * 200, 500)
    this.camera.updateProjectionMatrix()
    const dist = Math.max(radius * 2.4, this.camera.near * 4)
    this.camera.position.set(
      sphere.center.x + dist * 0.6,
      sphere.center.y + dist * 0.4,
      sphere.center.z + dist * 0.6,
    )
    this.controls.target.copy(sphere.center)
    this.controls.update()
  }

  getCameraPose(): Pose {
    if (!this.camera) return { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } }
    const c = this.camera
    return {
      pos: { x: c.position.x, y: c.position.y, z: c.position.z },
      rot: {
        x: c.rotation.x * (180 / Math.PI),
        y: c.rotation.y * (180 / Math.PI),
        z: c.rotation.z * (180 / Math.PI),
      },
    }
  }

  setCameraPose(pose: Pose): void {
    if (!this.camera) return
    applyPose(this.camera, pose)
  }

  render(): void {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.controls?.dispose()
    this.gizmo?.dispose()
    if (this.renderer) {
      this.renderer.dispose()
      const el = this.renderer.domElement
      el.parentNode?.removeChild(el)
    }
  }

  get isDisposed(): boolean {
    return this.disposed
  }
}
