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
import { snapIntersection, type SnapMode } from './surfaceSnap'
import { KP_POINT_COLOR } from '@/lib/constants'
import { frameAt } from '@/lib/keypoints'
import type { Pose, Vec3 } from '@/types/project'

const CLICK_SLOP = 6
/** Keypoint axis arrows, in marker radii; colors match the X/Y/Z inputs. */
const AXIS_LENGTH = 7
const AXIS_COLORS = { x: 0xe06a6a, y: 0x7ac08f, z: 0x6a8fe0 }

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
  /** Fired when a gizmo drag ends, with the object's new pose. */
  onObjectMoved?: (id: string, pose: Pose) => void
}

export class WorldSession {
  objects = new Map<string, THREE.Object3D>()
  selectedId: string | null = null
  gizmo: TransformControls | null = null
  scene: THREE.Scene | null = null
  camera: THREE.PerspectiveCamera | null = null
  renderer: THREE.WebGLRenderer | null = null
  controls: OrbitControls | null = null

  /** Keypoint snap mode while keypoint picking is on (null = off). While
   *  set, hovering a mesh shows the hovered face's snap points plus the one
   *  it snaps to, and a click reports that point. */
  private keypointMode: SnapMode | null = null
  private hoverMarker: THREE.Group | null = null
  private hoverCandidates: THREE.Points | null = null
  private hoverPointer: { x: number; y: number } | null = null
  private hoverDirty = false
  /** Set once the user orbits/pans/zooms: from then on, meshes finishing
   *  loading no longer re-frame the camera under them. */
  private viewTouched = false
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()

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
    controls.addEventListener('start', () => {
      this.viewTouched = true
    })
    this.controls = controls

    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setMode('translate')
    gizmo.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value
      const obj = this.selectedId ? this.objects.get(this.selectedId) : null
      if (!e.value && obj && this.selectedId) {
        const toDeg = THREE.MathUtils.radToDeg
        opts.onObjectMoved?.(this.selectedId, {
          pos: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
          rot: { x: toDeg(obj.rotation.x), y: toDeg(obj.rotation.y), z: toDeg(obj.rotation.z) },
        })
      }
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

    this.wirePicking(renderer.domElement)

    const clock = new THREE.Clock()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = clock.getDelta()
      controls.update()
      opts.onFrame?.(dt)
      this.updateHover()
      renderer.render(scene, camera)
    }
    loop()

    opts.onReady?.()
  }

  /** Closest visible stage object under the given client coordinates. */
  private raycastAt(
    clientX: number,
    clientY: number,
  ): { id: string; hit: THREE.Intersection } | null {
    if (!this.renderer || !this.camera) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)

    let best: { id: string; hit: THREE.Intersection } | null = null
    for (const [id, obj] of this.objects) {
      // view-only objects (set by hooks/useWorldSession.ts) are never picked
      if (!obj.visible || obj.userData.msViewOnly) continue
      const hits = this.raycaster.intersectObject(obj, true)
      if (hits.length && (!best || hits[0].distance < best.hit.distance)) {
        best = { id, hit: hits[0] }
      }
    }
    return best
  }

  /** Snaps a hit to the nearest corner / edge mark while keypoint picking
   *  is on (raw surface point otherwise), so hover preview and click agree. */
  private resolveHit(best: { id: string; hit: THREE.Intersection }): PickHit & {
    candidates: Vec3[]
  } {
    const { hit } = best
    if (this.keypointMode === null) {
      const n = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0)
      return {
        nodeId: best.id,
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        normal: { x: n.x, y: n.y, z: n.z },
        candidates: [],
      }
    }
    return { nodeId: best.id, ...snapIntersection(hit, this.keypointMode) }
  }

  private wirePicking(dom: HTMLElement): void {
    let down: { x: number; y: number } | null = null

    let viewAtDown: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null

    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY }
      if (this.camera && this.controls) {
        viewAtDown = {
          pos: this.camera.position.clone(),
          target: this.controls.target.clone(),
        }
      }
    })
    dom.addEventListener('pointerup', (e) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > CLICK_SLOP) return
      // A click is not an orbit: OrbitControls still turned the camera by
      // the few pixels of hand jitter (and damping would keep drifting it),
      // so put the view back exactly where it was.
      if (viewAtDown) this.restoreView(viewAtDown.pos, viewAtDown.target)
      if (!this.opts.onPick) return
      const best = this.raycastAt(e.clientX, e.clientY)
      if (!best) {
        this.opts.onPick(null)
        return
      }
      const { nodeId, point, normal } = this.resolveHit(best)
      this.opts.onPick({ nodeId, point, normal })
    })
    dom.addEventListener('pointermove', (e) => {
      // no preview while orbiting / dragging
      this.hoverPointer = e.buttons === 0 ? { x: e.clientX, y: e.clientY } : null
      this.hoverDirty = true
    })
    dom.addEventListener('pointerleave', () => {
      this.hoverPointer = null
      this.hoverDirty = true
    })
  }

  private restoreView(pos: THREE.Vector3, target: THREE.Vector3): void {
    const { camera, controls } = this
    if (!camera || !controls) return
    // with damping off, update() consumes any pending rotate/pan/zoom
    // delta at once — flush it, then overwrite the result
    const damping = controls.enableDamping
    controls.enableDamping = false
    controls.update()
    camera.position.copy(pos)
    controls.target.copy(target)
    controls.update()
    controls.enableDamping = damping
  }

  /** Turns keypoint picking on (with the given snap mode) or off (null). */
  setKeypointMode(mode: SnapMode | null): void {
    this.keypointMode = mode
    this.hoverDirty = true
  }

  /** Raycasts at most once per frame for the hover preview — pointermove
   *  fires far more often than that, and raycasting a dense mesh isn't free. */
  private updateHover(): void {
    // markers are unit-sized; keep them a constant size on screen
    const marker = this.hoverMarker
    if (marker?.visible) marker.scale.setScalar(this.markerRadiusAt(marker.position))
    for (const m of this.pickMarkers) m.scale.setScalar(this.markerRadiusAt(m.position))
    if (!this.hoverDirty) return
    this.hoverDirty = false

    const best =
      this.keypointMode !== null && this.hoverPointer
        ? this.raycastAt(this.hoverPointer.x, this.hoverPointer.y)
        : null
    if (this.renderer) this.renderer.domElement.style.cursor = best ? 'crosshair' : ''
    if (!best) {
      if (marker) marker.visible = false
      if (this.hoverCandidates) this.hoverCandidates.visible = false
      return
    }
    const hit = this.resolveHit(best)
    this.showHoverCandidates(hit.candidates)
    this.showHoverMarker(hit.point, hit.normal)
  }

  /** Small dots on every snap point of the hovered face (corners + edge
   *  midpoints, or the face center), so it's visible what's on offer. */
  private showHoverCandidates(points: Vec3[]): void {
    if (!this.scene) return
    if (!this.hoverCandidates) {
      this.hoverCandidates = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial({
          color: KP_POINT_COLOR,
          size: 5,
          sizeAttenuation: false,
          depthTest: false,
          transparent: true,
          opacity: 0.8,
        }),
      )
      this.hoverCandidates.renderOrder = 999
      this.hoverCandidates.frustumCulled = false
      this.scene.add(this.hoverCandidates)
    }
    const flat = new Float32Array(points.length * 3)
    points.forEach((p, i) => flat.set([p.x, p.y, p.z], i * 3))
    this.hoverCandidates.geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    this.hoverCandidates.visible = points.length > 0
  }

  /** A dot on the snapped point plus a ring lying flat on the surface
   *  (oriented by its normal), so the preview reads as sitting on the mesh.
   *  Unit-sized; updateHover() rescales it to a constant screen size. */
  private showHoverMarker(point: Vec3, normal: Vec3): void {
    if (!this.scene) return
    if (!this.hoverMarker) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 16, 16),
        new THREE.MeshBasicMaterial({ color: KP_POINT_COLOR, depthTest: false }),
      )
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.9, 32),
        new THREE.MeshBasicMaterial({
          color: KP_POINT_COLOR,
          depthTest: false,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      )
      dot.renderOrder = 1000
      ring.renderOrder = 1000
      this.hoverMarker = new THREE.Group()
      this.hoverMarker.add(dot, ring)
      this.scene.add(this.hoverMarker)
    }
    const marker = this.hoverMarker
    marker.visible = true
    marker.position.set(point.x, point.y, point.z)
    // RingGeometry lies in the XY plane, facing +Z
    marker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(normal.x, normal.y, normal.z).normalize(),
    )
    marker.scale.setScalar(this.markerRadiusAt(marker.position))
  }

  addObject(id: string, object3d: THREE.Object3D): void {
    if (!this.scene) return
    this.objects.set(id, object3d)
    this.scene.add(object3d)
    this.hoverDirty = true
  }

  removeObject(id: string): void {
    const obj = this.objects.get(id)
    if (!obj) return
    if (this.selectedId === id) this.setSelected(null)
    this.objects.delete(id)
    this.scene?.remove(obj)
    this.hoverDirty = true
  }

  /** A stage object by id, or a part inside an assembly input by its part
   *  key (`asmId/meshId`, see lib/graph.ts) — each segment after the first
   *  names a child built by lib/three/stageInput.ts. */
  getObject(id: string): THREE.Object3D | null {
    const direct = this.objects.get(id)
    if (direct) return direct
    const [top, ...rest] = id.split('/')
    let obj: THREE.Object3D | undefined = rest.length ? this.objects.get(top) : undefined
    for (const seg of rest) {
      obj = obj?.children.find((c) => c.userData.msNodeId === seg)
    }
    return obj ?? null
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

  /** A sphere plus the keypoint's local axes (X/Y tangent to the surface,
   *  Z along its normal) at each pending keypoint pick — the feedback that
   *  a click registered before a second point completes the link, and how
   *  that surface is oriented. Not part of `objects`, so they're never
   *  raycast-picked themselves. Unit-sized; updateHover() rescales them. */
  setPickMarkers(picks: Array<{ point: Vec3; normal: Vec3 }>): void {
    if (!this.scene) return
    for (const m of this.pickMarkers) {
      this.scene.remove(m)
      for (const child of m.children) {
        // ArrowHelper geometry is shared by every instance — free only
        // this arrow's materials
        if (child instanceof THREE.ArrowHelper) {
          ;(child.line.material as THREE.Material).dispose()
          ;(child.cone.material as THREE.Material).dispose()
        } else if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          ;(child.material as THREE.Material).dispose()
        }
      }
    }
    this.pickMarkers = picks.map(({ point, normal }) => {
      const group = new THREE.Group()
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: KP_POINT_COLOR, depthTest: false }),
      )
      sphere.renderOrder = 999
      group.add(sphere)

      const frame = frameAt(point, normal)
      const axes: Array<[Vec3, number]> = [
        [frame.tangent, AXIS_COLORS.x],
        [frame.bitangent, AXIS_COLORS.y],
        [frame.normal, AXIS_COLORS.z],
      ]
      for (const [d, color] of axes) {
        const arrow = new THREE.ArrowHelper(
          new THREE.Vector3(d.x, d.y, d.z),
          new THREE.Vector3(),
          AXIS_LENGTH,
          color,
          AXIS_LENGTH * 0.28,
          AXIS_LENGTH * 0.14,
        )
        arrow.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            ;(child.material as THREE.Material).depthTest = false
            child.renderOrder = 999
          }
        })
        group.add(arrow)
      }

      group.position.set(point.x, point.y, point.z)
      group.scale.setScalar(this.markerRadiusAt(group.position))
      this.scene!.add(group)
      return group
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

  /** frameAll(), but only until the user has moved the view themselves —
   *  for meshes that finish loading while the user may already be working. */
  frameAllIfUntouched(): void {
    if (!this.viewTouched) this.frameAll()
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
