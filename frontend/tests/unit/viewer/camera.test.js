import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VIEWS, blendPose, fitDistance, poseFor } from '../../../src/viewer/camera.js';

const dimensions = { width: 2000, height: 2400, depth: 600 };
const design = { dimensions };
const FOV = 40;

function corners({ width, height, depth }) {
  const points = [];
  for (const x of [0, width]) for (const y of [0, height]) for (const z of [0, -depth]) points.push(new THREE.Vector3(x, y, z).multiplyScalar(0.001));
  return points;
}

describe('fitDistance', () => {
  it('grows as the aspect ratio shrinks', () => {
    expect(fitDistance(dimensions, FOV, 0.5)).toBeGreaterThan(fitDistance(dimensions, FOV, 0.8));
    expect(fitDistance(dimensions, FOV, 0.8)).toBeGreaterThan(fitDistance(dimensions, FOV, 1.8));
  });

  it('is vertical-limited for wide aspects', () => {
    expect(fitDistance(dimensions, FOV, 1.8)).toBeCloseTo(fitDistance(dimensions, FOV, 4), 9);
    const radius = 0.5 * Math.hypot(2, 2.4, 0.6);
    expect(fitDistance(dimensions, FOV, 4, 1)).toBeCloseTo(radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2)), 9);
  });

  it('survives a degenerate aspect', () => {
    expect(Number.isFinite(fitDistance(dimensions, FOV, 0))).toBe(true);
  });
});

describe('VIEWS', () => {
  it('are frozen unit vectors', () => {
    expect(Object.isFrozen(VIEWS)).toBe(true);
    for (const direction of Object.values(VIEWS)) {
      expect(Object.isFrozen(direction)).toBe(true);
      expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
    }
  });
});

describe('poseFor', () => {
  it('keeps every corner of the wardrobe inside the frustum', () => {
    for (const aspect of [0.5, 1, 1.8]) {
      for (const view of Object.keys(VIEWS)) {
        const pose = poseFor(design, view, FOV, aspect);
        const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.05, 60);
        camera.position.fromArray(pose.position);
        camera.lookAt(...pose.target);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        for (const corner of corners(dimensions)) {
          const ndc = corner.clone().project(camera);
          expect(Math.abs(ndc.x), `${view} @ ${aspect} x`).toBeLessThanOrEqual(1);
          expect(Math.abs(ndc.y), `${view} @ ${aspect} y`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('targets the wardrobe centre and ignores unknown views', () => {
    const { target } = poseFor(design, 'front', FOV, 1);
    expect(target).toEqual([1, 1.2, -0.3]);
    expect(poseFor(design, 'nope', FOV, 1)).toBeNull();
  });
});

describe('blendPose', () => {
  it('returns the end poses at t = 0 and t = 1', () => {
    const from = poseFor(design, 'front', FOV, 1);
    const to = poseFor(design, 'side', FOV, 1);
    blendPose(from, to, 0).position.forEach((v, i) => expect(v).toBeCloseTo(from.position[i], 9));
    blendPose(from, to, 1).position.forEach((v, i) => expect(v).toBeCloseTo(to.position[i], 9));
  });
});
