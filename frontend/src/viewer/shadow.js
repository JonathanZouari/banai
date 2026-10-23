// Directional-light shadow fitting (pure maths, no DOM or WebGL). The orthographic shadow
// camera is sized to the wardrobe plus the patch of floor it can shadow, so the fixed-size
// shadow map is only spent where something is drawn.
import * as THREE from 'three';

const MARGIN = 0.12; // m, padding around the fitted volume

/** The 8 corners of `box`, plus where each lands on the floor (y = 0) along the light direction. */
function shadowPoints(box, towardLight) {
  const corners = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  if (towardLight.y < 0.05) return corners; // light too low for a meaningful floor shadow
  const floorPoints = corners.map((corner) => corner.clone().addScaledVector(towardLight, -Math.max(corner.y, 0) / towardLight.y));
  return [...corners, ...floorPoints];
}

/**
 * Aim `light` at the centre of the world-space `box` (keeping its direction) and fit its
 * orthographic shadow camera (left/right/top/bottom/near/far) around the box and its floor shadow.
 */
export function fitShadowCamera(light, box, margin = MARGIN) {
  const towardLight = light.position.clone().sub(light.target.position).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(towardLight, radius + 1);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();

  const camera = light.shadow.camera;
  camera.position.copy(light.position);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const toView = camera.matrixWorld.clone().invert();
  const view = new THREE.Box3();
  shadowPoints(box, towardLight).forEach((point) => view.expandByPoint(point.applyMatrix4(toView)));

  // The camera looks down -z in its own space, so the nearest point has the largest z.
  Object.assign(camera, {
    left: view.min.x - margin,
    right: view.max.x + margin,
    bottom: view.min.y - margin,
    top: view.max.y + margin,
    near: Math.max(0.01, -view.max.z - margin),
    far: -view.min.z + margin,
  });
  camera.updateProjectionMatrix();
}
