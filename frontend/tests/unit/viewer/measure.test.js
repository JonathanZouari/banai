// Measuring (viewer/measure.js, ADR-040): snapping to corners and edges, a straight line, and the label.
import { describe, expect, it } from 'vitest';
import { boxParts, describe as describeLine, lockAxis, nearestOnSegment, snapPoint } from '../../../src/viewer/measure.js';

const box = { min: [0, 0, -600], max: [2000, 2400, 0] };
const toScreen = ([x, y, z]) => [x / 4 + z / 40, -y / 4 + z / 40]; // 4 mm a pixel, a front view seen a little from the side

describe('snapping', () => {
  it('a box has 8 corners and 12 edges', () => {
    const { corners, edges } = boxParts(box);
    expect(corners).toHaveLength(8);
    expect(edges).toHaveLength(12);
    expect(nearestOnSegment([500, 50, 0], [[0, 0, 0], [2000, 0, 0]])).toEqual([500, 0, 0]);
  });

  it('a corner within 14 px takes the point, else an edge within 9 px, else the point stays', () => {
    expect(snapPoint([30, 2370, 0], box, toScreen)).toEqual({ point: [0, 2400, 0], snap: 'corner' }); // 7.5 px off
    expect(snapPoint([1000, 2380, 0], box, toScreen)).toEqual({ point: [1000, 2400, 0], snap: 'edge' }); // 5 px under the top
    expect(snapPoint([1000, 1200, 0], box, toScreen)).toEqual({ point: [1000, 1200, 0], snap: null });
    expect(snapPoint([1000, 1200, 0], null, toScreen).snap).toBeNull();
    // A mesh's own corners: a wall's inner corner at x = 0, not its slab's box 10 cm further out.
    const wall = { corners: [[0, 0, 0], [0, 2400, 0], [-100, 0, -100]], edges: [[[0, 0, 0], [0, 2400, 0]]] };
    expect(snapPoint([20, 2380, 0], wall, toScreen)).toEqual({ point: [0, 2400, 0], snap: 'corner' });
    // A corner behind the camera (no screen point) never takes the point.
    const behind = (p) => (p[2] > 100 ? null : toScreen(p));
    expect(snapPoint([30, 2370, 0], { corners: [[0, 2400, 500]], edges: [] }, behind).snap).toBeNull();
  });
});

describe('a line', () => {
  it('Shift keeps it on the axis it leans to most', () => {
    expect(lockAxis([0, 0, 0], [1000, 80, -30])).toEqual([1000, 0, 0]);
    expect(lockAxis([100, 100, 0], [130, 900, 10])).toEqual([100, 900, 0]);
  });

  it('reads in cm, with the width, height and depth it spans', () => {
    expect(describeLine([0, 0, 0], [2000, 0, 0])).toMatchObject({ mm: 2000, label: '200.0 ס״מ', detail: '' });
    const slanted = describeLine([0, 0, 0], [300, 400, 0]);
    expect(slanted).toMatchObject({ mm: 500, dx: 300, dy: 400, dz: 0, label: '50.0 ס״מ', detail: 'רוחב 30.0 · גובה 40.0' });
  });
});
