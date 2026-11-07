import { describe, expect, it } from 'vitest';
import { checkFit } from '../../../src/room/roomModel.js';
import { loadDesign } from '../domain/helpers.js';

const basic = loadDesign('basic'); // 2000 x 2400 x 600 mm
const room = (width, height, depth) => ({ width, height, depth, obstacles: [] });

describe('checkFit (wardrobe vs the measured wall; no invented clearances)', () => {
  it('fits when every dimension is within the space, including exactly equal', () => {
    const fit = checkFit(basic, room(2000, 2600, 650));
    expect(fit.status).toBe('fits');
    expect(fit.lines.map((l) => l.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('is too big when any dimension is larger, and says by how much', () => {
    const fit = checkFit(basic, room(1800, 2600, 550));
    expect(fit.status).toBe('tooBig');
    expect(fit.lines[0]).toMatchObject({ field: 'width', status: 'over', over: 200 });
    expect(fit.lines[2]).toMatchObject({ field: 'depth', status: 'over', over: 50 });
  });

  it('too big wins over missing measurements', () => {
    expect(checkFit(basic, room(1800, null, null)).status).toBe('tooBig');
  });

  it('is incomplete with some measurements, and empty with none', () => {
    expect(checkFit(basic, room(2500, null, null)).status).toBe('incomplete');
    expect(checkFit(basic, room(null, null, null)).status).toBe('empty');
    expect(checkFit(basic, undefined).status).toBe('empty');
  });

  it('ignores anything that is not a whole number of millimetres', () => {
    expect(checkFit(basic, room('2500', 2.5, NaN)).status).toBe('empty');
  });
});
