import { describe, expect, it } from 'vitest';
import { VIEWS, ease, frameView } from '../../../src/viewer/camera.js';

const DIMS = { width: 2000, height: 2400, depth: 600 };

describe('frameView', () => {
  it('targets the centre of the wardrobe', () => {
    const { target } = frameView(DIMS, { fovDeg: 40, aspect: 1.5 });
    expect(target).toEqual([1, 1.2, -0.3]);
  });

  it('moves the camera further away in a narrow viewport so the sides are not cropped', () => {
    const wide = frameView(DIMS, { fovDeg: 40, aspect: 2 });
    const narrow = frameView(DIMS, { fovDeg: 40, aspect: 0.5 });
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it('keeps the whole bounding sphere inside both fields of view', () => {
    for (const aspect of [0.4, 1, 1.8, 3]) {
      const { distance } = frameView(DIMS, { fovDeg: 40, aspect });
      const radius = Math.hypot(2, 2.4, 0.6) / 2;
      const vHalf = (40 * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      expect(Math.asin(radius / distance)).toBeLessThanOrEqual(Math.min(vHalf, hHalf) + 1e-9);
    }
  });

  it('places the camera at the requested distance along the preset direction', () => {
    for (const view of Object.keys(VIEWS)) {
      const { target, position, distance } = frameView(DIMS, { fovDeg: 40, aspect: 1.5, view });
      expect(Math.hypot(...position.map((p, i) => p - target[i]))).toBeCloseTo(distance, 9);
    }
  });

  it('puts the front view straight in front of the wardrobe', () => {
    const { target, position } = frameView(DIMS, { fovDeg: 40, aspect: 1.5, view: 'front' });
    expect(position[0]).toBeCloseTo(target[0], 9);
    expect(position[2]).toBeGreaterThan(0);
  });

  it('falls back to the 3/4 view for an unknown preset', () => {
    expect(frameView(DIMS, { fovDeg: 40, aspect: 1.5, view: 'nope' }))
      .toEqual(frameView(DIMS, { fovDeg: 40, aspect: 1.5, view: 'angle' }));
  });
});

describe('ease', () => {
  it('starts at 0, ends at 1 and is symmetric', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 9);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1, 9);
  });
});
