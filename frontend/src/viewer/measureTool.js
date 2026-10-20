// Measuring in 3D (ADR-040): with the tool on, press on a first point, drag and release on a second. A dashed
// line shows the distance in cm, and how much of it is width, height and depth. Near a corner or an edge of an
// object the point snaps to it (Alt: no snapping); Shift keeps the line on one axis. Up to MAX lines stay;
// Escape drops the one being drawn. Any surface in view counts: the wardrobe, the room's walls, floor, obstacles
// and openings, and the floor without a room; a wall faded by the cut-away does not get in the way.
// View only: nothing is saved or changes the design; hidden in renders and video.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MIN_MM, describe, lockAxis, snapPoint } from './measure.js';

export const MAX = 5;
const MAX_EDGES = 600; // a mesh with more (a curtain of clothes) is measured without snapping
const shapes = new WeakMap(); // geometry → its edges (local), computed once

/** The hit mesh's own corners and edges in mm, world space: a wall's inner corner, not its box's. */
function shapeOf(mesh) {
  if (!mesh.geometry) return null;
  let local = shapes.get(mesh.geometry);
  if (local === undefined) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 20);
    const position = edges.getAttribute('position');
    local = position.count / 2 > MAX_EDGES ? null : position.array.slice();
    edges.dispose();
    shapes.set(mesh.geometry, local);
  }
  if (!local) return null;
  const v = new THREE.Vector3();
  const points = [];
  for (let i = 0; i < local.length; i += 3) points.push(toMm(v.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(mesh.matrixWorld)));
  const edges = [];
  for (let i = 0; i < points.length; i += 2) edges.push([points[i], points[i + 1]]);
  const seen = new Set();
  const corners = points.filter((p) => { const key = p.map((c) => Math.round(c)).join(','); return seen.has(key) ? false : seen.add(key); });
  return { corners, edges };
}
const toMm = (v) => [v.x * 1000, v.y * 1000, v.z * 1000];
const toVec = (p) => new THREE.Vector3(p[0] / 1000, p[1] / 1000, p[2] / 1000);

/**
 * @param dom, camera, controls  the viewer's canvas, camera and OrbitControls (paused while a line is drawn)
 * @param scene        where the lines go
 * @param getTargets   () => the objects to measure on (searched deeply)
 * @param isEnabled    () => false while a render, a video or a comparison runs
 * @param onChange     ({ active, count }) => void
 */
export function attachMeasuring({ dom, camera, controls, scene, getTargets, isEnabled, onChange }) {
  const raycaster = new THREE.Raycaster();
  const group = new THREE.Group();
  group.name = 'measurements';
  scene.add(group);
  const lineMaterial = new THREE.LineDashedMaterial({ color: '#d0451b', dashSize: 0.025, gapSize: 0.015, depthTest: false, toneMapped: false });
  const dotMaterial = new THREE.MeshBasicMaterial({ color: '#d0451b', depthTest: false, toneMapped: false });
  const dotGeometry = new THREE.SphereGeometry(0.008, 12, 8);
  let active = false;
  let drawing = null; // { start, pointerId, item }
  const lines = []; // [{ item, a, b, info }]

  const notify = () => onChange?.({ active, count: lines.length });

  const hitAt = (event) => {
    const rect = dom.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hits = [];
    const shown = (node) => { for (let n = node; n; n = n.parent) if (!n.visible) return false; return true; };
    for (const root of getTargets()) {
      root.updateMatrixWorld();
      root.traverse((node) => {
        if (!node.isMesh || !shown(node)) return;
        const material = Array.isArray(node.material) ? node.material[0] : node.material;
        // A faded wall or glass: look through it (the floor's shadow catcher is see-through but is the floor).
        if (material?.transparent && material.opacity < 0.5 && !material.isShadowMaterial) return;
        // Room parts are never picked for selection (their raycast is off), but they can be measured.
        THREE.Mesh.prototype.raycast.call(node, raycaster, hits);
      });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] ?? null;
  };

  const toScreen = (p) => {
    const v = toVec(p).project(camera);
    if (v.z < -1 || v.z > 1) return null; // behind the camera (or past its far plane): it would project mirrored
    const rect = dom.getBoundingClientRect();
    return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
  };

  /** The point under the pointer (snapped unless Alt), or on the plane through `from` facing the camera. */
  const pointAt = (event, from = null) => {
    const hit = hitAt(event);
    if (hit) {
      if (event.altKey) return toMm(hit.point);
      return snapPoint(toMm(hit.point), shapeOf(hit.object), toScreen).point;
    }
    if (!from) return null;
    const normal = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, toVec(from));
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return point ? toMm(point) : null;
  };

  const makeItem = () => {
    const item = new THREE.Group();
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geometry, lineMaterial);
    line.renderOrder = 20;
    const ends = [new THREE.Mesh(dotGeometry, dotMaterial), new THREE.Mesh(dotGeometry, dotMaterial)];
    ends.forEach((e) => { e.renderOrder = 20; });
    const element = document.createElement('div');
    element.className = 'measure-label';
    element.dir = 'rtl';
    const label = new CSS2DObject(element);
    item.add(line, ...ends, label);
    group.add(item);
    return { item, line, ends, label, element };
  };

  const draw = (entry, a, b) => {
    const [va, vb] = [toVec(a), toVec(b)];
    entry.line.geometry.setFromPoints([va, vb]);
    entry.line.computeLineDistances();
    entry.ends[0].position.copy(va);
    entry.ends[1].position.copy(vb);
    entry.label.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    const info = describe(a, b);
    entry.element.textContent = '';
    const main = document.createElement('b');
    main.textContent = info.label;
    entry.element.append(main);
    if (info.detail) {
      const small = document.createElement('span');
      small.textContent = info.detail;
      entry.element.append(small);
    }
    return info;
  };

  const remove = (entry) => {
    group.remove(entry.item);
    entry.line.geometry.dispose();
    entry.element.remove();
  };

  const onPointerDown = (event) => {
    if (!active || event.button !== 0 || !event.isPrimary || drawing || !isEnabled()) return;
    const start = pointAt(event);
    if (!start) return;
    controls.enabled = false; // capture phase: the camera does not turn while a line is drawn
    event.stopImmediatePropagation(); // nothing else (selection, drag) takes this press
    drawing = { start, end: start, pointerId: event.pointerId, entry: makeItem() };
    draw(drawing.entry, start, start);
    try { dom.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
  };
  const onPointerMove = (event) => {
    if (!drawing || event.pointerId !== drawing.pointerId) return;
    let end = pointAt(event, drawing.start);
    if (!end) return;
    if (event.shiftKey) end = lockAxis(drawing.start, end);
    drawing.end = end;
    draw(drawing.entry, drawing.start, end);
  };
  const stop = (keep) => {
    if (!drawing) return;
    const { entry, start, end, pointerId } = drawing;
    drawing = null;
    controls.enabled = true;
    try { dom.releasePointerCapture(pointerId); } catch { /* the pointer is already gone */ }
    const info = describe(start, end);
    if (!keep || info.mm < MIN_MM) {
      remove(entry);
      return;
    }
    lines.push({ entry, a: start, b: end, info });
    while (lines.length > MAX) remove(lines.shift().entry);
    notify();
  };
  const onPointerUp = (event) => {
    if (drawing && event.pointerId === drawing.pointerId) stop(true);
  };
  const onCancel = () => stop(false);
  const onKey = (event) => {
    if (event.key === 'Escape' && drawing) {
      event.stopPropagation();
      stop(false);
    }
  };

  dom.addEventListener('pointerdown', onPointerDown, { capture: true });
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onCancel);
  dom.addEventListener('lostpointercapture', onCancel); // released outside, or capture lost: the line ends
  window.addEventListener('keydown', onKey, true);

  return {
    get active() { return active; },
    get drawing() { return Boolean(drawing); },
    /** Test hook: the kept lines: [{ mm, dx, dy, dz }]. */
    get lines() { return lines.map(({ info }) => ({ mm: info.mm, dx: info.dx, dy: info.dy, dz: info.dz })); },
    setActive(on) {
      if (active === Boolean(on)) return;
      active = Boolean(on);
      if (!active) stop(false);
      dom.classList.toggle('is-measuring', active);
      notify();
    },
    clear() {
      stop(false);
      lines.splice(0).forEach(({ entry }) => remove(entry));
      notify();
    },
    /** Show or hide the lines (renders, video, comparing); hidden, the crosshair goes too. */
    setVisible(on) {
      group.visible = on;
      dom.classList.toggle('is-measuring', active && on);
    },
    dispose() {
      this.clear();
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true });
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey, true);
      scene.remove(group);
      [lineMaterial, dotMaterial, dotGeometry].forEach((x) => x.dispose());
    },
  };
}
