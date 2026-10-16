import { describe, expect, it } from 'vitest';
import { createWoodTexture, grainField } from '../../../src/viewer/woodGrain.js';

const W = 64;
const H = 256;
const at = (field, x, y) => field[y * W + x];
const meanDiff = (field, pairs) => pairs.reduce((sum, [a, b]) => sum + Math.abs(at(field, ...a) - at(field, ...b)), 0) / pairs.length;

describe('grainField', () => {
  it('is deterministic per species and differs between species', () => {
    expect(grainField('walnut', W, H)).toEqual(grainField('walnut', W, H));
    expect(grainField('walnut', W, H)).not.toEqual(grainField('ash', W, H));
  });

  it('stays within 0..1', () => {
    const field = grainField('teak', W, H);
    expect(Math.min(...field)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...field)).toBeLessThanOrEqual(1);
  });

  it('tiles seamlessly: the wrap-around edges match like neighbouring pixels do', () => {
    const field = grainField('natural_oak', W, H);
    const xs = Array.from({ length: W }, (_, x) => x);
    const ys = Array.from({ length: H }, (_, y) => y);
    const vertical = meanDiff(field, xs.map((x) => [[x, H - 1], [x, 0]]));
    const verticalNeighbours = meanDiff(field, xs.map((x) => [[x, H / 2], [x, H / 2 + 1]]));
    const horizontal = meanDiff(field, ys.map((y) => [[W - 1, y], [0, y]]));
    const horizontalNeighbours = meanDiff(field, ys.map((y) => [[W / 2, y], [W / 2 + 1, y]]));
    expect(vertical).toBeLessThan(verticalNeighbours * 3 + 0.02);
    expect(horizontal).toBeLessThan(horizontalNeighbours * 3 + 0.02);
  });
});

describe('createWoodTexture', () => {
  it('returns null outside a browser', () => {
    expect(createWoodTexture('walnut')).toBeNull();
  });
});
