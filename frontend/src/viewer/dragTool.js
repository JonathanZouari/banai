// Drag in 3D (ADR-039): press on a draggable thing and move it along the straight lines dragRules.js allows.
// What may be pressed: the selected part of the wardrobe (the carcass or a door moves the whole wardrobe along its
// wall, a shelf, drawer, rail or insert moves up and down, a partition left and right), and directly any
// obstacle on the wall or any door or window of the room. A press elsewhere still orbits the camera.
//
// While dragging only the picture moves (the parts are offset in place), a label shows the value, and the value
// stops at its limits and snaps to whole centimetres and to useful places. On release one op list goes to the
// store: one undo step, checked by the engine. Two axes (an obstacle, a window) lock to the first clear direction,
// so a drag is always a straight line. Escape or a lost pointer puts everything back.
//
// Stage 2: a stretch handle (handles3d.js) changes a size instead: a ghost box previews it, and the drop sends
// the new size. A click (no drag) on an obstacle shows its handles.
import * as THREE from 'three';
import { roomWalls, toWardrobe } from '../domain/room.js';
import { alongAxis, dragSpec, settle, targetForSelection } from './dragRules.js';
import { resizeSpec } from './resizeRules.js';

const START_PX = 6; // movement before a press becomes a drag; above picking's click tolerance (5 px)
const LOCK_PX = 10; // movement before a two-axis drag picks its direction
const AXIS = Object.freeze({ x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) });

/**
 * @param dom          the canvas
 * @param camera, controls  the viewer's camera and OrbitControls (paused while dragging)
 * @param store        the design store (getState, dispatch)
 * @param getWardrobe  () => the wardrobe's group (children carry userData.componentId)
 * @param getRoom      () => the room overlay's group (obstacles, walls and openings)
 * @param isEnabled    () => false while a render, a video or a comparison runs
 * @param onError      (DomainError) => void, when the engine refuses a drop
 * @param onWardrobeMoved (mm) => void, after the wardrobe moved along its wall (the camera follows the room)
 * @param onStart, onEnd  (target) => void, when a drag starts moving and when it ends (stale overlays hide meanwhile)
 * @param onPreview    () => void, after each preview move (shadows are drawn on demand)
 * @param getExtras    (target) => more objects that move with it (the wardrobe's clothes)
 * @param handles      the stretch handles (handles3d.js): grabbed first, they are drawn over everything
 * @param onActivate   (target) => void, a click on an obstacle (its handles show)
 * @param onResized    (before, after, spec, value) => void, after a stretch was dropped
 * @param getFigures   () => the scale figures' group when shown (people carry userData.personIndex)
 * @param onDrop       (dropping) => void, true just before a stretch is dispatched and false after (the viewer
 *                     then keeps its camera instead of refitting to the new size)
 */
export function attachDragging({ dom, camera, controls, store, getWardrobe, getRoom, isEnabled, onError, onWardrobeMoved, onStart, onEnd,
  onPreview, getExtras = () => [], handles = null, onActivate, onResized, onDrop, getFigures = () => null }) {
  const raycaster = new THREE.Raycaster();
  const label = document.createElement('div');
  label.className = 'drag-label';
  label.hidden = true;
  label.setAttribute('role', 'status');
  label.dataset.testid = 'drag-label';
  document.body.append(label);
  let drag = null;
  let grabbable = false;
  let tookPress = false; // this press is the drag tool's: it is not also a click that selects
  let hoverFrame = 0;

  const rayAt = (clientX, clientY) => {
    const rect = dom.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
    return raycaster.ray;
  };

  /** Room things under the pointer: obstacles and openings, nearest first ({ target, point, objects }). */
  const roomHits = (ray) => {
    const hits = [];
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    const figures = getFigures();
    if (figures) { // the people standing in the room (ADR-041)
      figures.updateMatrixWorld();
      figures.children.forEach((body) => {
        if (Number.isInteger(body.userData.personIndex) && ray.intersectBox(box.setFromObject(body), point)) {
          hits.push({ target: { kind: 'figure', index: body.userData.personIndex }, point: point.clone(), objects: [body] });
        }
      });
    }
    const room = getRoom();
    if (!room) return hits.sort((a, b) => a.point.distanceTo(ray.origin) - b.point.distanceTo(ray.origin));
    room.updateMatrixWorld();
    room.traverse((node) => {
      const piece = node.userData.furnitureIndex;
      if (Number.isInteger(piece) && ray.intersectBox(box.setFromObject(node), point)) {
        hits.push({ target: { kind: 'furniture', index: piece }, point: point.clone(), objects: [node] });
      }
      const index = node.userData.obstacleIndex;
      if (Number.isInteger(index) && ray.intersectBox(box.setFromObject(node), point)) {
        hits.push({ target: { kind: 'obstacle', index }, point: point.clone(), objects: [node] });
      }
      const opening = /^room-(door|window)-(\d+)$/.exec(node.name ?? '');
      if (opening && ray.intersectBox(box.setFromObject(node), point)) {
        const k = Number(opening[2]);
        const parts = room.getObjectsByProperty('name', node.name);
        hits.push({ target: { kind: 'opening', index: k }, point: point.clone(), objects: parts });
      }
    });
    return hits.sort((a, b) => a.point.distanceTo(ray.origin) - b.point.distanceTo(ray.origin));
  };

  /** What a press at the pointer would drag, or null. */
  const pick = (clientX, clientY) => {
    if (!isEnabled()) return null;
    const ray = rayAt(clientX, clientY);
    const { design, selection } = store.getState();
    const grabbed = handles?.hit(raycaster);
    if (grabbed) { // a stretch handle wins: it is drawn over everything
      const rs = resizeSpec(design, grabbed.handle);
      if (rs) {
        return {
          target: { kind: 'resize', handle: grabbed.handle }, point: grabbed.point, objects: [grabbed.object], resize: rs,
          spec: { axes: [{ key: 'v', vector: rs.axis.vector, value: rs.axis.value, limits: rs.axis.limits, snaps: rs.axis.snaps }],
            label: (values) => rs.label(values.v), ops: (values) => rs.ops(values.v) },
        };
      }
    }
    const wardrobe = getWardrobe();
    let best = null;
    let nearest = Infinity; // the wardrobe hides whatever is behind it, selected or not
    if (wardrobe) {
      wardrobe.updateMatrixWorld();
      const [hit] = raycaster.intersectObjects(wardrobe.children, false);
      if (hit) nearest = hit.distance;
      const owner = hit?.object.userData;
      const sameWardrobe = ['carcass', 'door'].includes(selection?.kind) && ['carcass', 'door'].includes(owner?.kind);
      if (hit && selection && (owner.componentId === selection.id || sameWardrobe)) {
        const target = targetForSelection(design, selection);
        const objects = target?.kind === 'wardrobe' ? [wardrobe, ...getExtras(target)]
          : wardrobe.children.filter((m) => m.userData.componentId === selection.id);
        if (target) best = { target, point: hit.point.clone(), objects, distance: hit.distance };
      }
    }
    const [roomHit] = roomHits(ray).filter((h) => h.point.distanceTo(ray.origin) < nearest);
    if (roomHit && (!best || roomHit.point.distanceTo(ray.origin) < best.distance)) best = roomHit;
    if (!best) return null;
    const spec = dragSpec(design, best.target);
    return spec ? { ...best, spec } : null;
  };

  /** The world direction of each axis of a target. */
  const axisVector = (target, key) => {
    if (key === 'y' || target.kind !== 'opening') return AXIS[key];
    const { design } = store.getState();
    const o = design.room.openings[target.index];
    const { start, end } = roomWalls(design.room.shape)[o.wall];
    const [a, b] = [toWardrobe(design, start), toWardrobe(design, end)];
    return new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
  };

  /**
   * The axis a two-axis drag follows: the one whose direction on screen best matches the pointer's movement. An
   * axis seen end-on (pointing at the camera) has almost no length on screen and is never chosen.
   */
  const lockedAxis = (current, event) => {
    const rect = dom.getBoundingClientRect();
    const toPx = (v) => { const p = v.clone().project(camera); return [((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height]; };
    const from = toPx(current.point);
    const move = [event.clientX - current.start.x, event.clientY - current.start.y];
    const length = Math.hypot(...move) || 1;
    let best = current.axes[0].key;
    let score = -1;
    current.axes.forEach((axis) => {
      const to = toPx(current.point.clone().addScaledVector(axis.vector, 0.1)); // 10 cm along it
      const dir = [to[0] - from[0], to[1] - from[1]];
      const dirLength = Math.hypot(...dir);
      if (dirLength < 2) return; // end-on: no movement on screen can be read from it
      const match = Math.abs(move[0] * dir[0] + move[1] * dir[1]) / (length * dirLength);
      if (match > score) [best, score] = [axis.key, match];
    });
    return best;
  };

  const showLabel = (text, clientX, clientY) => {
    label.textContent = text;
    label.hidden = false;
    label.style.left = `${clientX + 14}px`;
    label.style.top = `${clientY - 34}px`;
  };

  const restore = () => {
    drag?.objects.forEach((object, i) => object.position.copy(drag.origins[i]));
  };
  const finish = () => {
    if (drag?.resize) handles.ghost(null);
    if (drag?.moving) onEnd?.(drag.target);
    if (drag?.pointerId !== undefined) {
      try { dom.releasePointerCapture(drag.pointerId); } catch { /* the pointer is already gone */ }
    }
    drag = null;
    controls.enabled = true;
    label.hidden = true;
    dom.style.cursor = '';
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || !event.isPrimary || drag) return; // a second finger never takes over a gesture
    tookPress = false;
    const found = pick(event.clientX, event.clientY);
    if (!found) return;
    // Only a handle, an obstacle or an opening owns its click; a click on a wardrobe part still selects.
    tookPress = ['resize', 'obstacle', 'opening', 'figure', 'furniture'].includes(found.target.kind);
    controls.enabled = false; // runs before OrbitControls sees this press (capture phase), so it does not orbit
    drag = {
      ...found,
      design: store.getState().design, // the drag is built on this design; any other ends it
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origins: found.objects.map((o) => o.position.clone()),
      axes: found.spec.axes.map((axis) => ({ ...axis, vector: axis.vector ? new THREE.Vector3(...axis.vector) : axisVector(found.target, axis.key) })),
      locked: found.spec.axes.length === 1 ? found.spec.axes[0].key : null,
      moving: false,
      values: {},
    };
    try { dom.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
  };

  const onPointerMove = (event) => {
    if (!drag) return hover(event);
    if (event.pointerId !== drag.pointerId) return undefined;
    if (!isEnabled()) return onPointerCancel(); // a render, a video or a comparison began
    const moved = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y);
    if (!drag.moving && moved < START_PX) return undefined;
    if (!drag.moving) onStart?.(drag.target);
    drag.moving = true;
    dom.style.cursor = 'grabbing';
    const ray = rayAt(event.clientX, event.clientY);
    const point = [drag.point.x, drag.point.y, drag.point.z];
    const deltas = Object.fromEntries(drag.axes.map((axis) => {
      const t = alongAxis(ray.origin.toArray(), ray.direction.toArray(), point, axis.vector.toArray());
      return [axis.key, t === null ? 0 : t * 1000];
    }));
    if (!drag.locked) {
      if (moved < LOCK_PX) return undefined;
      drag.locked = lockedAxis(drag, event); // the axis the pointer moves along on screen
    }
    const axis = drag.axes.find((a) => a.key === drag.locked);
    const value = settle(axis.value + deltas[axis.key], axis.limits, axis.snaps);
    drag.values = { [axis.key]: value };
    const offset = axis.vector.clone().multiplyScalar((value - axis.value) / 1000);
    drag.objects.forEach((object, i) => object.position.copy(drag.origins[i]).add(offset));
    if (drag.resize) handles.ghost(drag.resize.ghost(value));
    onPreview?.();
    showLabel(drag.spec.label(drag.values), event.clientX, event.clientY);
    return undefined;
  };

  const onPointerUp = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (store.getState().design !== drag.design || !isEnabled()) return onPointerCancel(); // never drop on a newer design
    const { moving, spec, values, target, resize } = drag;
    restore();
    finish();
    if (!moving) {
      if (target.kind === 'obstacle') onActivate?.(target); // a click shows the obstacle's stretch handles
      return undefined;
    }
    const ops = spec.ops(values);
    if (!ops) return;
    const before = store.getState().design;
    if (resize) onDrop?.(true);
    let result;
    try {
      result = store.dispatch(ops);
    } finally {
      if (resize) onDrop?.(false);
    }
    if (!result?.ok) {
      onError?.(result?.error);
      return;
    }
    if (target.kind === 'wardrobe') onWardrobeMoved?.(values.x - before.room.offset);
    if (resize) onResized?.(before, store.getState().design, resize, values.v);
    return undefined;
  };

  const onPointerCancel = () => {
    if (!drag) return;
    restore();
    onPreview?.();
    finish();
  };
  // An undo, a new project, a chat proposal or a comparison while dragging: the drag ends, nothing is dropped.
  const unsubscribe = store.subscribe(() => {
    if (drag && store.getState().design !== drag.design) onPointerCancel();
  });
  const onKey = (event) => {
    if (event.key === 'Escape' && drag) {
      event.stopPropagation();
      onPointerCancel();
    }
  };

  // The grab cursor: one check per animation frame, only while no button is down.
  const hover = (event) => {
    if (event.buttons !== 0) return;
    const { clientX, clientY } = event;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      grabbable = Boolean(pick(clientX, clientY));
      if (grabbable) dom.style.cursor = 'grab';
    });
  };

  dom.addEventListener('pointerdown', onPointerDown, { capture: true });
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerCancel);
  dom.addEventListener('lostpointercapture', onPointerCancel);
  window.addEventListener('keydown', onKey, true);
  return {
    get grabbable() { return grabbable; },
    /** Whether the last press was taken by a drag or a handle (then it does not select on release). */
    get tookPress() { return tookPress; },
    get dragging() { return Boolean(drag?.moving); },
    dispose() {
      onPointerCancel();
      unsubscribe();
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true });
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerCancel);
      dom.removeEventListener('lostpointercapture', onPointerCancel);
      window.removeEventListener('keydown', onKey, true);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      label.remove();
    },
  };
}
