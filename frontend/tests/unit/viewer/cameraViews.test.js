import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VIEWS, cameraPose, easeInOutCubic, interpolatePose } from '../../../src/viewer/cameraViews.js';

const FOV = 40;
const basic = { width: 2000, height: 2400, depth: 600 };
const MAX_POLAR = Math.PI / 2 - 0.02; // the viewer's OrbitControls limit
const offsetOf = ({ position, target }) => position.map((value, i) => value - target[i]);
const polarOf = (pose) => {
  const [x, y, z] = offsetOf(pose);
  return Math.acos(y / Math.hypot(x, y, z));
};
const closeAll = (actual, expected) => actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));

describe('cameraPose', () => {
  it('aims every view at the centre of the wardrobe', () => {
    for (const view of VIEWS) closeAll(cameraPose(view, basic, FOV).target, [1, 1.2, -0.3]);
  });

  it('front looks straight at the doors', () => {
    const [x, y, z] = offsetOf(cameraPose('front', basic, FOV));
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it('side looks from the right, square to the side panel', () => {
    const [x, , z] = offsetOf(cameraPose('side', basic, FOV));
    expect(x).toBeGreaterThan(0);
    expect(z).toBeCloseTo(0, 9);
  });

  it('left side mirrors the right side', () => {
    const [rx, ry, rz] = offsetOf(cameraPose('side', basic, FOV));
    const [lx, ly, lz] = offsetOf(cameraPose('sideLeft', basic, FOV));
    expect(lx).toBeCloseTo(-rx, 9);
    expect(ly).toBeCloseTo(ry, 9);
    expect(lz).toBeCloseTo(rz, 9);
    expect(lx).toBeLessThan(0);
  });

  it('3/4 sits halfway between front and side, higher up', () => {
    const pose = cameraPose('threeQuarter', basic, FOV);
    const [x, , z] = offsetOf(pose);
    expect(x).toBeCloseTo(z, 9);
    expect(polarOf(pose)).toBeLessThan(polarOf(cameraPose('front', basic, FOV)));
  });

  it('reset is the opening view the viewer has always used', () => {
    const distance = (2.4 / (2 * Math.tan((FOV / 2) * (Math.PI / 180)))) * 1.35;
    closeAll(cameraPose('reset', basic, FOV).position, [1 + distance * 0.35, 1.2 + distance * 0.12, distance]);
  });

  it('keeps every view above the orbit limit, so the controls never clamp it', () => {
    for (const view of VIEWS) expect(polarOf(cameraPose(view, basic, FOV))).toBeLessThan(MAX_POLAR);
  });

  it('keeps the whole wardrobe in frame from every preset', () => {
    for (const dimensions of [basic, { width: 4000, height: 2400, depth: 600 }, { width: 600, height: 2600, depth: 650 }]) {
      const { width, height, depth } = dimensions;
      const corners = [0, width].flatMap((x) => [0, height].flatMap((y) => [0, -depth].map((z) => new THREE.Vector3(x, y, z).multiplyScalar(0.001))));
      for (const view of VIEWS) {
        const pose = cameraPose(view, dimensions, FOV);
        const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
        camera.position.fromArray(pose.position);
        camera.lookAt(new THREE.Vector3().fromArray(pose.target));
        camera.updateMatrixWorld();
        for (const corner of corners) {
          const { x, y } = corner.clone().project(camera);
          expect(Math.max(Math.abs(x), Math.abs(y)), `${view} ${width}x${height}x${depth}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('backs off further for a bigger wardrobe', () => {
    const near = Math.hypot(...offsetOf(cameraPose('front', basic, FOV)));
    const far = Math.hypot(...offsetOf(cameraPose('front', { width: 4000, height: 2400, depth: 600 }, FOV)));
    expect(far).toBeGreaterThan(near);
  });

  it('rejects an unknown view', () => {
    expect(() => cameraPose('top', basic, FOV)).toThrow(/Unknown camera view/);
  });
});

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1, passes the middle and only moves forward', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    const samples = Array.from({ length: 21 }, (_, i) => easeInOutCubic(i / 20));
    samples.slice(1).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(samples[i]));
  });
});

describe('interpolatePose', () => {
  const front = cameraPose('front', basic, FOV);
  const side = cameraPose('side', basic, FOV);

  it('returns the start and end poses at t = 0 and t = 1', () => {
    closeAll(interpolatePose(front, side, 0).position, front.position);
    closeAll(interpolatePose(front, side, 1).position, side.position);
  });

  it('orbits around the wardrobe instead of cutting through it', () => {
    const radius = (pose) => Math.hypot(...offsetOf(pose));
    const middle = interpolatePose(front, side, 0.5);
    expect(radius(middle)).toBeGreaterThanOrEqual(Math.min(radius(front), radius(side)) - 1e-9);
    const [x, , z] = offsetOf(middle);
    expect(Math.atan2(x, z)).toBeCloseTo(Math.PI / 4, 9);
  });

  it('swings from one side to the other past the front, never behind the wardrobe', () => {
    const left = cameraPose('sideLeft', basic, FOV);
    for (const [from, to] of [[side, left], [left, side]]) {
      const [x, , z] = offsetOf(interpolatePose(from, to, 0.5));
      expect(z).toBeGreaterThan(0);
      expect(Math.abs(x)).toBeLessThan(1e-6);
    }
  });

  it('turns the short way round', () => {
    const behindLeft = { target: [0, 0, 0], position: [-Math.sin(3), 0.2, Math.cos(3)] }; // azimuth -3 rad
    const behindRight = { target: [0, 0, 0], position: [Math.sin(3), 0.2, Math.cos(3)] }; // azimuth +3 rad
    const [x, , z] = offsetOf(interpolatePose(behindLeft, behindRight, 0.5));
    expect(Math.abs(Math.atan2(x, z))).toBeCloseTo(Math.PI, 9);
  });
});
