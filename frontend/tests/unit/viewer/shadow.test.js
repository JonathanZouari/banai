import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitShadowCamera } from '../../../src/viewer/shadow.js';

const wardrobe = (width, height, depth) => new THREE.Box3(new THREE.Vector3(0, 0, -depth), new THREE.Vector3(width, height, 0.04));

function keyLight() {
  const light = new THREE.DirectionalLight('#ffffff', 1);
  light.position.set(3, 5, 4);
  return light;
}

/** NDC of a world point as seen by the light's shadow camera. */
function ndcOf(light, point) {
  const camera = light.shadow.camera;
  camera.updateMatrixWorld();
  return point.clone().applyMatrix4(camera.matrixWorld.clone().invert()).applyMatrix4(camera.projectionMatrix);
}

describe('fitShadowCamera', () => {
  it('aims the light at the box centre and keeps its direction', () => {
    const light = keyLight();
    const direction = light.position.clone().normalize();
    const box = wardrobe(2, 2.4, 0.6);
    fitShadowCamera(light, box);
    expect(light.target.position.distanceTo(box.getCenter(new THREE.Vector3()))).toBeLessThan(1e-9);
    expect(light.position.clone().sub(light.target.position).normalize().distanceTo(direction)).toBeLessThan(1e-9);
  });

  it.each([[2, 2.4, 0.6], [0.6, 0.8, 0.3], [4, 3, 0.9]])('keeps a %s x %s x %s box and its floor shadow inside the frustum', (w, h, d) => {
    const light = keyLight();
    const box = wardrobe(w, h, d);
    fitShadowCamera(light, box);

    const towardLight = light.position.clone().sub(light.target.position).normalize();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const corner = new THREE.Vector3(x, y, z);
          const onFloor = corner.clone().addScaledVector(towardLight, -y / towardLight.y);
          for (const point of [corner, onFloor]) {
            const ndc = ndcOf(light, point);
            expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
            expect(Math.abs(ndc.z)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('refits to new dimensions with a valid, tight orthographic volume', () => {
    const light = keyLight();
    fitShadowCamera(light, wardrobe(2, 2.4, 0.6));
    const large = light.shadow.camera.right - light.shadow.camera.left;
    fitShadowCamera(light, wardrobe(0.6, 0.8, 0.3));
    const { left, right, top, bottom, near, far } = light.shadow.camera;
    expect(right - left).toBeLessThan(large);
    expect(right - left).toBeLessThan(3);
    expect(top).toBeGreaterThan(bottom);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  });

  it('survives a light at the horizon (no floor shadow to include)', () => {
    const light = new THREE.DirectionalLight('#ffffff', 1);
    light.position.set(5, 0, 0);
    fitShadowCamera(light, wardrobe(2, 2.4, 0.6));
    expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  });
});
