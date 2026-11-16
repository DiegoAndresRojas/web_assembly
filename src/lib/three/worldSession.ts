// Owns the three.js side of the 3D viewport: renderer, camera rig, render
// loop and pointer picking. Everything here is imperative (mutates a live
// scene) — hooks/useWorldSession.ts is the only caller, and it is the
// bridge back to React state. Typed port of
// only_js/src/composables/useWorldSession.js (now a class, and three.js is
// a static import instead of a lazily-loaded esm.sh module).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

import { applyPose, readPose } from './buildMesh'
import { ANIM_ASPECT, AnimCameraRig } from './animCameraRig'
import { snapIntersection, type SnapMode } from './surfaceSnap'
import { ANIM_CAMERA_KEY, KP_POINT_COLOR } from '@/lib/constants'
import { frameAt } from '@/lib/keypoints'
import type { Pose, Vec3 } from '@/types/project'

const CLICK_SLOP = 6
/** Keypoint axis arrows, in marker radii; colors match the X/Y/Z inputs. */
const AXIS_LENGTH = 7
const AXIS_COLORS = { x: 0xe06a6a, y: 0x7ac08f, z: 0x6a8fe0 }

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/** Whether `obj` and every ancestor up to (and including) `root` are visible. */
function shownUpTo(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (!o.visible) return false
    if (o === root) return true
  }
  return true
}

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
  /** Ids of the stage objects that move rigidly with `id` while it is
   *  dragged (e.g. linked by keypoints). */
  companionsOf?: (id: string) => string[]
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
  /** The view this stage was left with last time (see holdView). */
  private heldView: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
  /** 'top' picks whole stage inputs (assembly: keypoints work on those);
   *  'part' picks the deepest piece inside an assembly input, reported as
   *  its part key (`asm/…/mesh`). */
  private pickDepth: 'top' | 'part' = 'top'
  /** No orbit, picking or gizmo — while a playback owns the world. */
  private locked = false
  /** The animation camera owns the view: OrbitControls must not update
   *  (its update() would re-aim the camera at the orbit target). */
  private cameraDriven = false
  /** The animation camera, an object in the world of its own. */
  private animRig: AnimCameraRig | null = null
  /** Render through the animation camera instead of the working one. */
  private lookThrough = false
  /** Width ÷ height of the animation camera's frame. */
  private frameAspect = ANIM_ASPECT
  /** Opacity of whatever is cleared behind the scene: 1 except while
   *  exporting with a transparent background. */
  private clearAlpha = 1
  private grid: THREE.GridHelper | null = null
  private gizmoHelper: THREE.Object3D | null = null
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

    // alpha: an export can leave the background out altogether; while
    // editing, the scene's own background keeps the canvas opaque
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(4, 6, 4)
    scene.add(dir)
    this.grid = new THREE.GridHelper(20, 20, 0x3a3752, 0x24223a)
    scene.add(this.grid)

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
      controls.enabled = !e.value && !this.locked && !this.cameraDriven
      const obj = this.selectedId ? this.getObject(this.selectedId) : null
      if (e.value) this.beginCompanionDrag(obj)
      else this.companionDrag = null
      if (!e.value && obj && this.selectedId) opts.onObjectMoved?.(this.selectedId, readPose(obj))
    })
    // whatever is tied to the dragged object follows it as it moves
    gizmo.addEventListener('objectChange', () => this.moveCompanions())
    this.gizmoHelper = gizmo.getHelper()
    scene.add(this.gizmoHelper)
    this.gizmo = gizmo

    const rig = new AnimCameraRig(camera.fov)
    scene.add(rig.root)
    this.animRig = rig

    // (the animation camera keeps its own frame, see setFrameAspect)
    const resize = () => {
      if (this.exportSize) return // export owns the canvas size until it ends
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    this.resize = resize
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
      if (!this.cameraDriven) controls.update()
      opts.onFrame?.(dt)
      this.updateHover()
      if (this.viewingThrough()) this.renderFramed(rig.camera)
      else renderer.render(scene, camera)
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
      if (!obj.visible) continue
      // three's raycaster ignores `visible` — skip pieces hidden inside
      const hit = this.raycaster.intersectObject(obj, true).find((h) => shownUpTo(h.object, obj))
      if (hit && (!best || hit.distance < best.hit.distance)) best = { id, hit }
    }
    // the animation camera's body is pickable too (not while keypointing)
    const rig = this.animRig
    if (rig?.root.visible && rig.visual.visible && this.keypointMode === null) {
      const hit = this.raycaster
        .intersectObject(rig.visual, true)
        .find((h) => h.object.userData.msAnimCamera)
      if (hit && (!best || hit.distance < best.hit.distance)) best = { id: ANIM_CAMERA_KEY, hit }
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
        nodeId: this.pickKey(best.id, hit.object),
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        normal: { x: n.x, y: n.y, z: n.z },
        candidates: [],
      }
    }
    return { nodeId: best.id, ...snapIntersection(hit, this.keypointMode) }
  }

  /** The key to report for a hit on stage object `id`: the object itself,
   *  or at 'part' depth the path down to the deepest piece hit — segments
   *  come from the `msNodeId` lib/three/stageInput.ts tags each piece with. */
  private pickKey(id: string, hitObject: THREE.Object3D): string {
    if (this.pickDepth === 'top') return id
    const top = this.objects.get(id)
    const segs: string[] = []
    for (let o: THREE.Object3D | null = hitObject; o && o !== top; o = o.parent) {
      if (o.userData.msNodeId) segs.unshift(o.userData.msNodeId as string)
    }
    return [id, ...segs].join('/')
  }

  setPickDepth(depth: 'top' | 'part'): void {
    this.pickDepth = depth
  }

  /** Locks (or releases) every user interaction with the viewport. */
  setLocked(locked: boolean): void {
    this.locked = locked
    if (this.controls) this.controls.enabled = !locked && !this.cameraDriven
    if (locked) this.gizmo?.detach()
    else this.setSelected(this.selectedId)
    this.hoverDirty = true
  }

  /** Hands the view to the animation camera (setCameraPose from outside)
   *  or gives it back to OrbitControls — re-aiming the orbit target straight
   *  ahead of wherever the animation left the camera, so it doesn't snap. */
  setCameraDriven(driven: boolean): void {
    const { camera, controls } = this
    if (!camera || !controls || driven === this.cameraDriven) return
    this.cameraDriven = driven
    controls.enabled = !driven && !this.locked
    if (!driven) this.reaimOrbit()
  }

  /** Puts the orbit target straight ahead of the camera (keeping its
   *  distance), so orbiting resumes from the current view without a jump. */
  private reaimOrbit(): void {
    const { camera, controls } = this
    if (!camera || !controls) return
    const dist = Math.max(camera.position.distanceTo(controls.target), camera.near * 10)
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    controls.target.copy(camera.position).addScaledVector(ahead, dist)
    controls.update()
  }

  /** Moves the working view to `pose` (e.g. where the animation camera
   *  is) and lets the user orbit on from there. */
  adoptView(pose: Pose): void {
    if (!this.camera) return
    applyPose(this.camera, pose)
    this.camera.updateMatrixWorld()
    this.reaimOrbit()
  }

  /** Whether the user has orbited / zoomed the view themselves. */
  get viewWasTouched(): boolean {
    return this.viewTouched
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
      // looking through the animation camera is a preview, not a place to pick
      if (moved > CLICK_SLOP || this.locked || this.viewingThrough()) return
      // A click is not an orbit: OrbitControls still turned the camera by
      // the few pixels of hand jitter (and damping would keep drifting it),
      // so put the view back exactly where it was.
      if (viewAtDown && !this.cameraDriven) this.restoreView(viewAtDown.pos, viewAtDown.target)
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
      this.keypointMode !== null && this.hoverPointer && !this.locked && !this.viewingThrough()
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
    if (id === ANIM_CAMERA_KEY) return this.animRig?.root.visible ? this.animRig.root : null
    const direct = this.objects.get(id)
    if (direct) return direct
    const [top, ...rest] = id.split('/')
    let obj: THREE.Object3D | undefined = rest.length ? this.objects.get(top) : undefined
    for (const seg of rest) {
      obj = obj?.children.find((c) => c.userData.msNodeId === seg)
    }
    return obj ?? null
  }

  /** A piece inside an assembly input by its part key, always the one in
   *  the group — even when the same key also names a stage object of its
   *  own (a piece released from the assembly). */
  getNested(key: string): THREE.Object3D | null {
    const [top, ...rest] = key.split('/')
    let obj: THREE.Object3D | undefined = rest.length ? this.objects.get(top) : undefined
    for (const seg of rest) {
      obj = obj?.children.find((c) => c.userData.msNodeId === seg)
    }
    return obj ?? null
  }

  private companionDrag: {
    object: THREE.Object3D
    startInverse: THREE.Matrix4
    companions: Array<{ object: THREE.Object3D; start: THREE.Matrix4 }>
  } | null = null

  /** A gizmo drag starts on `obj`: note where it and its companions (see
   *  WorldSessionOptions.companionsOf) are, to carry them along. */
  private beginCompanionDrag(obj: THREE.Object3D | null): void {
    this.companionDrag = null
    const ids = obj && this.selectedId ? (this.opts.companionsOf?.(this.selectedId) ?? []) : []
    if (!obj || !ids.length) return
    obj.updateMatrix()
    const companions = ids
      .map((id) => this.objects.get(id))
      .filter((o): o is THREE.Object3D => !!o && o !== obj)
      .map((object) => {
        object.updateMatrix()
        return { object, start: object.matrix.clone() }
      })
    this.companionDrag = { object: obj, startInverse: obj.matrix.clone().invert(), companions }
  }

  private moveCompanions(): void {
    const drag = this.companionDrag
    if (!drag) return
    drag.object.updateMatrix()
    const delta = drag.object.matrix.clone().multiply(drag.startInverse)
    const scale = new THREE.Vector3()
    for (const { object, start } of drag.companions) {
      // (each companion keeps its own scale: `scale` is only decomposed into)
      delta.clone().multiply(start).decompose(object.position, object.quaternion, scale)
    }
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    if (!this.gizmo) return
    // a part key resolves to the piece inside its assembly group; the
    // gizmo handles the parent transform itself
    const obj = id && !this.locked && !this.viewingThrough() ? this.getObject(id) : null
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
    if (this.viewTouched) return
    // (framing also fits the clip planes to the pieces, so it runs even
    // when the view then goes back to where it was left)
    this.frameAll()
    if (this.heldView) this.restoreView(this.heldView.pos, this.heldView.target)
  }

  /** Looks from where the view was left last time, instead of framing the
   *  pieces, until the user moves the view again. */
  holdView(pos: THREE.Vector3Tuple, target: THREE.Vector3Tuple): void {
    this.heldView = {
      pos: new THREE.Vector3(...pos),
      target: new THREE.Vector3(...target),
    }
    this.restoreView(this.heldView.pos, this.heldView.target)
  }

  /** Where the view is worth coming back to: wherever the user put it
   *  (or it was held), null if it was only ever framed automatically. */
  get leftView(): { pos: THREE.Vector3Tuple; target: THREE.Vector3Tuple } | null {
    if (this.viewTouched && this.camera && this.controls) {
      return { pos: this.camera.position.toArray(), target: this.controls.target.toArray() }
    }
    if (this.heldView) {
      return { pos: this.heldView.pos.toArray(), target: this.heldView.target.toArray() }
    }
    return null
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
    // the animation camera shares the clip range, and its body is sized to
    // read clearly next to the pieces
    this.animRig?.setClip(this.camera.near, this.camera.far)
    this.animRig?.setSize(radius * 0.16)
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

  // ---------- animation camera ----------

  /** Places the animation camera (its track's pose), or hides it (null:
   *  the stage animates no camera). */
  setAnimCamera(pose: Pose | null): void {
    const rig = this.animRig
    if (!rig) return
    const wasVisible = rig.root.visible
    rig.root.visible = !!pose
    if (pose) applyPose(rig.root, pose)
    // (un)hiding changes what a "camera" selection resolves to
    if (wasVisible !== rig.root.visible && this.selectedId === ANIM_CAMERA_KEY) {
      this.setSelected(this.selectedId)
    }
  }

  getAnimCameraPose(): Pose | null {
    const rig = this.animRig
    return rig?.root.visible ? readPose(rig.root) : null
  }

  /** See the world through the animation camera (its body hides, the
   *  working view and its controls wait untouched until turned off). */
  setLookThrough(on: boolean): void {
    this.lookThrough = on
    if (this.animRig) this.animRig.visual.visible = !on
    if (this.controls) this.controls.enabled = !on && !this.locked && !this.cameraDriven
    this.setSelected(this.selectedId)
    this.hoverDirty = true
  }

  private viewingThrough(): boolean {
    return this.lookThrough && !!this.animRig?.root.visible
  }

  render(): void {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera)
  }

  /** Renders one frame through the animation camera (video export),
   *  without its own body in the shot. False if there is none. */
  renderAnimCamera(): boolean {
    const rig = this.animRig
    if (!rig?.root.visible || !this.renderer || !this.scene) return false
    const shown = rig.visual.visible
    rig.visual.visible = false
    this.renderFramed(rig.camera)
    rig.visual.visible = shown
    return true
  }

  /** Sets the shape of the animation camera's frame (width ÷ height). */
  setFrameAspect(aspect: number): void {
    if (!(aspect > 0) || aspect === this.frameAspect) return
    this.frameAspect = aspect
    this.animRig?.setAspect(aspect)
  }

  /** Width ÷ height of the viewport as it is on screen. */
  viewportAspect(): number {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    return w > 0 && h > 0 ? w / h : ANIM_ASPECT
  }

  /** Renders the animation camera into the largest rectangle of its frame
   *  shape that fits the canvas, black bars around it — exactly the shot
   *  video export records. */
  private renderFramed(cam: THREE.Camera): void {
    const { renderer, scene } = this
    if (!renderer || !scene) return
    const size = renderer.getSize(new THREE.Vector2())
    let w = size.x
    let h = w / this.frameAspect
    if (h > size.y) {
      h = size.y
      w = h * this.frameAspect
    }
    const x = (size.x - w) / 2
    const y = (size.y - h) / 2
    renderer.setScissorTest(false)
    renderer.setClearColor(0x000000, this.clearAlpha)
    renderer.clear()
    renderer.setViewport(x, y, w, h)
    renderer.setScissor(x, y, w, h)
    renderer.setScissorTest(true)
    renderer.render(scene, cam)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, size.x, size.y)
  }

  // ---------- video export ----------

  private resize: (() => void) | null = null
  private exportSize: {
    pixelRatio: number
    background: THREE.Scene['background']
    gridVisible: boolean
    gizmoVisible: boolean
  } | null = null

  /** Switches the canvas to a fixed video size (CSS size untouched) for
   *  the length of an export; the working camera — used when the stage
   *  animates no camera — takes that shape too. `background` is what the
   *  video shows behind the pieces: a CSS color, `null` for nothing at all
   *  (transparent), or `'workspace'` for the editing backdrop and grid.
   *  The gizmo never makes it into the shot. Returns the canvas. */
  beginExport(
    width: number,
    height: number,
    background: string | null | 'workspace' = 'workspace',
  ): HTMLCanvasElement | null {
    const { renderer, camera, scene } = this
    if (!renderer || !camera || !scene) return null
    if (this.exportSize) this.endExport()
    this.exportSize = {
      pixelRatio: renderer.getPixelRatio(),
      background: scene.background,
      gridVisible: this.grid?.visible ?? true,
      gizmoVisible: this.gizmoHelper?.visible ?? true,
    }
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (this.gizmoHelper) this.gizmoHelper.visible = false
    if (background !== 'workspace') {
      if (this.grid) this.grid.visible = false
      scene.background = background === null ? null : new THREE.Color(background)
      this.clearAlpha = background === null ? 0 : 1
      renderer.setClearColor(0x000000, this.clearAlpha)
    }
    return renderer.domElement
  }

  endExport(): void {
    const { renderer, scene } = this
    const saved = this.exportSize
    if (!renderer || !saved) return
    renderer.setPixelRatio(saved.pixelRatio)
    if (scene) scene.background = saved.background
    if (this.grid) this.grid.visible = saved.gridVisible
    if (this.gizmoHelper) this.gizmoHelper.visible = saved.gizmoVisible
    this.clearAlpha = 1
    renderer.setClearColor(0x000000, 1)
    this.exportSize = null
    this.resize?.()
  }

  dispose(): void {
    this.disposed = true
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.controls?.dispose()
    this.gizmo?.dispose()
    this.animRig?.dispose()
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
