// Click-to-select via raycasting. A drag (orbit) is not a click.
import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 5;

/**
 * `onHover(hit, event)` runs at most once per frame while the pointer moves without a button pressed.
 * `onLeave()` runs when the pointer leaves the canvas or a press starts (a drag orbits the camera).
 */
export function attachPicking({ dom, camera, getTargets, onPick, onHover = () => {}, onLeave = () => {} }) {
  const raycaster = new THREE.Raycaster();
  let down = null;
  let hoverFrame = 0;
  const cancelHover = () => {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  };

  const onPointerDown = (event) => {
    down = { x: event.clientX, y: event.clientY };
    cancelHover();
    onLeave();
  };
  const hitAt = (event) => {
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Refresh world matrices first: a scene rebuilt since the last rendered frame would otherwise be
    // picked at its identity transform, and the click would miss (flaky when frames are slow).
    camera.updateMatrixWorld();
    const targets = getTargets();
    targets.forEach((object) => object.updateMatrixWorld(true));
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(targets, false)[0] ?? null;
  };
  const onPointerUp = (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    down = null;
    onPick(hitAt(event));
  };
  // Hover feedback (cursor, label). Throttled to one raycast per frame, for the latest position;
  // ignored while dragging.
  let lastMove = null;
  const onPointerMove = (event) => {
    if (event.buttons) return;
    lastMove = event;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      onHover(hitAt(lastMove), lastMove);
    });
  };
  // A pending raycast is dropped, so nothing reappears after the pointer has left.
  const onPointerLeave = () => {
    cancelHover();
    onLeave();
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerleave', onPointerLeave);
  return () => {
    cancelHover();
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerleave', onPointerLeave);
  };
}
