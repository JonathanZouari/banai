import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY, moveOverlay, overlayForKey, resizeOverlay } from '../../../src/room/overlayMath.js';

describe('overlay position (fractions of the photo; never a measurement)', () => {
  it('moves and stays inside the photo', () => {
    expect(moveOverlay(DEFAULT_OVERLAY, 0.1, -0.05)).toMatchObject({ x: 0.6, y: 0.5 });
    expect(moveOverlay(DEFAULT_OVERLAY, 5, -5)).toMatchObject({ x: 1, y: 0 });
  });

  it('resizes within limits', () => {
    expect(resizeOverlay(DEFAULT_OVERLAY, 2).height).toBeCloseTo(1.2);
    expect(resizeOverlay(DEFAULT_OVERLAY, 100).height).toBe(1.5);
    expect(resizeOverlay(DEFAULT_OVERLAY, 0.0001).height).toBe(0.1);
  });

  it('arrow keys move, +/- resize, other keys do nothing', () => {
    expect(overlayForKey(DEFAULT_OVERLAY, 'ArrowRight').x).toBeGreaterThan(DEFAULT_OVERLAY.x);
    expect(overlayForKey(DEFAULT_OVERLAY, 'ArrowUp').y).toBeLessThan(DEFAULT_OVERLAY.y);
    expect(overlayForKey(DEFAULT_OVERLAY, '+').height).toBeGreaterThan(DEFAULT_OVERLAY.height);
    expect(overlayForKey(DEFAULT_OVERLAY, '-').height).toBeLessThan(DEFAULT_OVERLAY.height);
    expect(overlayForKey(DEFAULT_OVERLAY, 'a')).toBeNull();
  });
});
