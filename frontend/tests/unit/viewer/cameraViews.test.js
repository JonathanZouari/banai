import { describe, expect, it } from 'vitest';
import { createStore } from '../../../src/state/store.js';
import { basicWardrobe } from '../../../src/domain/presets.js';
import {
  CAMERA, VIEWS, centreOf, createTransition, easeInOutCubic, interpolatePose, viewPose,
} from '../../../src/viewer/cameraViews.js';
import { VIEW_BUTTONS, VIEW_LABELS } from '../../../src/viewer/viewControls.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const dims = basicWardrobe(catalog).dimensions; // 2000 x 2400 x 600 mm
const [cx, cy, cz] = centreOf(dims);
const dist = (pose) => Math.hypot(...pose.position.map((v, i) => v - pose.target[i]));
const near = (a, b, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('viewPose', () => {
  it('looks at the wardrobe centre in every view', () => {
    for (const name of VIEWS) near(viewPose(name, dims).target, [cx, cy, cz]);
  });

  it('front is straight on, at mid height, in front of the wardrobe', () => {
    const { position } = viewPose('front', dims);
    expect(position[0]).toBeCloseTo(cx);
    expect(position[1]).toBeGreaterThanOrEqual(cy);
    expect(position[1] - cy).toBeLessThan(0.15); // as level as the orbit limit allows
    expect(position[2]).toBeGreaterThan(cz);
  });

  it('side is level with the centre and to the right', () => {
    const { position } = viewPose('side', dims);
    expect(position[0]).toBeGreaterThan(cx + 1);
    expect(position[1]).toBeGreaterThanOrEqual(cy);
    expect(position[1] - cy).toBeLessThan(0.15);
    expect(position[2]).toBeCloseTo(cz);
  });

  it('level views stay inside the orbit controls polar limit', () => {
    for (const name of VIEWS) {
      const { position, target } = viewPose(name, dims);
      const radius = Math.hypot(...position.map((v, i) => v - target[i]));
      const polar = Math.acos((position[1] - target[1]) / radius);
      expect(polar).toBeLessThanOrEqual(CAMERA.maxPolarAngle + 1e-9);
    }
  });

  it('3/4 is front-right at 45 degrees and slightly above', () => {
    const { position } = viewPose('threeQuarter', dims);
    expect(position[0] - cx).toBeCloseTo(position[2] - cz);
    expect(position[0]).toBeGreaterThan(cx);
    expect(position[1]).toBeGreaterThan(cy);
  });

  it('reset is the default fit pose', () => {
    const { position } = viewPose('reset', dims);
    const d = position[2];
    near(position, [cx + d * 0.35, cy + d * 0.12, d]);
  });

  it('distance grows with the wardrobe and stays inside the controls limits', () => {
    const small = viewPose('front', { width: 800, height: 1200, depth: 400 });
    const large = viewPose('front', { width: 4000, height: 3000, depth: 800 });
    expect(dist(large)).toBeGreaterThan(dist(small));
    const huge = viewPose('front', { width: 90000, height: 90000, depth: 9000 });
    const tiny = viewPose('front', { width: 10, height: 10, depth: 10 });
    expect(dist(huge)).toBeLessThanOrEqual(CAMERA.maxDistance + 1e-9);
    expect(dist(tiny)).toBeGreaterThanOrEqual(CAMERA.minDistance - 1e-9);
  });

  it('stands further back for a narrow viewport so the whole width fits', () => {
    const wide = viewPose('front', dims, { aspect: 2 });
    const narrow = viewPose('front', dims, { aspect: 0.6 });
    expect(dist(narrow)).toBeGreaterThan(dist(wide));
  });

  it('rejects an unknown view', () => {
    expect(() => viewPose('top', dims)).toThrow(RangeError);
  });
});

describe('interpolation', () => {
  const a = viewPose('front', dims);
  const b = viewPose('side', dims);

  it('starts and ends exactly on the two poses', () => {
    near(interpolatePose(a, b, 0).position, a.position);
    near(interpolatePose(a, b, 1).position, b.position);
    near(interpolatePose(a, b, 1).target, b.target);
  });

  it('keeps the camera on an arc around the target (no cut through the wardrobe)', () => {
    const mid = interpolatePose(a, b, 0.5);
    const lo = Math.min(dist(a), dist(b)) - 1e-9;
    const hi = Math.max(dist(a), dist(b)) + 1e-9;
    expect(dist(mid)).toBeGreaterThanOrEqual(lo);
    expect(dist(mid)).toBeLessThanOrEqual(hi);
    expect(mid.position[0]).toBeGreaterThan(cx); // between front (x = centre) and side (x > centre)
    expect(mid.position[2]).toBeGreaterThan(cz);
  });

  it('turns by the shortest arc', () => {
    const at = (deg) => ({ position: [Math.sin((deg * Math.PI) / 180) * 3, 1, Math.cos((deg * Math.PI) / 180) * 3], target: [0, 1, 0] });
    const mid = interpolatePose(at(350), at(10), 0.5); // passes through 0 deg, not 180
    expect(mid.position[2]).toBeGreaterThan(2.9);
    expect(Math.abs(mid.position[0])).toBeLessThan(0.01);
  });

  it('easing is monotonic with fixed endpoints', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeInOutCubic(t)).toBeGreaterThanOrEqual(previous);
      previous = easeInOutCubic(t);
    }
  });
});

describe('transition', () => {
  const from = viewPose('front', dims);
  const to = viewPose('side', dims);

  it('reaches the exact target pose after the duration', () => {
    const transition = createTransition({ from, to, startedAt: 1000, duration: 600 });
    const early = transition.sample(1100);
    expect(early.done).toBe(false);
    const end = transition.sample(1600);
    expect(end.done).toBe(true);
    near(end.pose.position, to.position);
    expect(transition.sample(5000).done).toBe(true);
  });

  it('jumps straight to the pose when the duration is 0 (reduced motion)', () => {
    const { pose, done } = createTransition({ from, to, startedAt: 0, duration: 0 }).sample(0);
    expect(done).toBe(true);
    near(pose.position, to.position);
  });
});

describe('camera views never touch the design state', () => {
  it('leaves the store untouched and notifies nobody', () => {
    const store = createStore({ design: basicWardrobe(catalog), revision: 3, catalog });
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    const before = store.getState();
    for (const name of VIEWS) {
      const transition = createTransition({ from: viewPose('reset', dims), to: viewPose(name, store.getState().design.dimensions), startedAt: 0 });
      transition.sample(100);
      transition.sample(10_000);
    }
    expect(store.getState()).toBe(before);
    expect(store.getState().design).toBe(before.design);
    expect(store.getState().revision).toBe(3);
    expect(notified).toBe(0);
  });
});

describe('labels', () => {
  it('every button has a Hebrew and an English label', () => {
    expect(VIEW_BUTTONS.map((b) => b.view)).toEqual([...VIEWS]);
    for (const code of ['he', 'en']) {
      expect(VIEW_LABELS[code].group).toBeTruthy();
      for (const { view } of VIEW_BUTTONS) expect(VIEW_LABELS[code][view], `${code}.${view}`).toBeTruthy();
    }
    expect(VIEW_LABELS.he).toMatchObject({ front: 'חזית', side: 'צד', threeQuarter: '3/4', reset: 'איפוס' });
  });
});
