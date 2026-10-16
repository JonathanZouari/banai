// Click-to-select and hover via raycasting. A drag (orbit) is not a click, and only the
// primary button picks (right/middle buttons orbit-pan without selecting).
import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 5;

export function attachPicking({ dom, camera, getTargets, onPick, onHover }) {
  const raycaster = new THREE.Raycaster();
  let down = null;
  let frame = 0;
  let pending = null;

  const hitAt = (event) => {
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const [hit] = raycaster.intersectObjects(getTargets(), false);
    return hit ?? null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    if (event.button !== 0) return;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    down = null;
    onPick(hitAt(event));
  };

  // Hover: one raycast per animation frame, skipped while a button is held (orbiting).
  const onPointerMove = (event) => {
    if (!onHover || event.buttons !== 0) return;
    pending = { clientX: event.clientX, clientY: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pending) onHover(hitAt(pending));
      pending = null;
    });
  };
  const onPointerLeave = () => {
    pending = null;
    if (onHover) onHover(null);
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerleave', onPointerLeave);
  return () => {
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerleave', onPointerLeave);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
  };
}
