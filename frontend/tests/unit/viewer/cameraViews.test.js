import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraPose, createCameraMover, TRANSITION_MS, VIEWS } from '../../../src/viewer/cameraViews.js';
import { loadDesign } from '../domain/helpers.js';

const design = loadDesign('basic'); // 2000 × 2400 × 600 mm
const FOV = 40;

const rig = () => ({ camera: new THREE.PerspectiveCamera(FOV), controls: { target: new THREE.Vector3() } });

describe('camera views', () => {
  it('every view looks at the centre of the wardrobe', () => {
    for (const view of VIEWS) {
      const { target } = cameraPose(design, view, FOV);
      expect(target.toArray().map((v) => +v.toFixed(3))).toEqual([1, 1.2, -0.3]);
    }
  });

  it('front is straight on, side is from the side, 3/4 is in between', () => {
    const front = cameraPose(design, 'front', FOV);
    expect(front.position.x).toBeCloseTo(front.target.x);
    expect(front.position.z).toBeGreaterThan(front.target.z + 3);
    const side = cameraPose(design, 'side', FOV);
    expect(side.position.z).toBeCloseTo(side.target.z);
    expect(side.position.x).toBeGreaterThan(side.target.x + 3);
    const quarter = cameraPose(design, 'threeQuarter', FOV);
    expect(quarter.position.x - quarter.target.x).toBeCloseTo(quarter.position.z - quarter.target.z);
    expect(quarter.position.y).toBeGreaterThan(front.position.y);
  });

  it('reset is exactly the framing the viewer has always opened with', () => {
    const distance = (2.4 / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))) * 1.35;
    const { position } = cameraPose(design, 'reset', FOV);
    expect(position.x).toBeCloseTo(1 + distance * 0.35);
    expect(position.y).toBeCloseTo(1.2 + distance * 0.12);
    expect(position.z).toBeCloseTo(distance);
  });

  it('rejects an unknown view', () => {
    expect(() => cameraPose(design, 'top', FOV)).toThrow(/unknown camera view/);
  });
});

describe('camera mover', () => {
  it('moves smoothly over the transition and ends exactly on the pose', () => {
    const { camera, controls } = rig();
    let time = 0;
    const mover = createCameraMover(camera, controls, { now: () => time, reducedMotion: () => false });
    const pose = cameraPose(design, 'front', FOV);
    mover.moveTo(pose);
    expect(camera.position.length()).toBe(0); // nothing jumps on the click itself
    time = TRANSITION_MS / 2;
    expect(mover.update()).toBe(true);
    const halfway = camera.position.clone();
    expect(halfway.x).toBeGreaterThan(0);
    expect(halfway.z).toBeLessThan(pose.position.z);
    time = TRANSITION_MS;
    expect(mover.update()).toBe(false);
    expect(camera.position.distanceTo(pose.position)).toBeLessThan(1e-9);
    expect(controls.target.distanceTo(pose.target)).toBeLessThan(1e-9);
    expect(mover.isMoving()).toBe(false);
  });

  it('with prefers-reduced-motion the camera jumps straight to the pose', () => {
    const { camera, controls } = rig();
    const mover = createCameraMover(camera, controls, { now: () => 0, reducedMotion: () => true });
    const pose = cameraPose(design, 'side', FOV);
    mover.moveTo(pose);
    expect(camera.position.distanceTo(pose.position)).toBeLessThan(1e-9);
    expect(mover.isMoving()).toBe(false);
  });

  it('cancel leaves the camera where it is (the customer took over)', () => {
    const { camera, controls } = rig();
    let time = 0;
    const mover = createCameraMover(camera, controls, { now: () => time, reducedMotion: () => false });
    mover.moveTo(cameraPose(design, 'front', FOV));
    time = TRANSITION_MS / 4;
    mover.update();
    const at = camera.position.clone();
    mover.cancel();
    time = TRANSITION_MS;
    expect(mover.update()).toBe(false);
    expect(camera.position.equals(at)).toBe(true);
  });
});
