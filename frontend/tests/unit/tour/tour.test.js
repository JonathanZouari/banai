import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, TOUR_STRINGS } from '../../../src/tour/steps.js';
import { TOUR_KEY, placeBubble, tourSeen } from '../../../src/tour/tour.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1400, height: 900 };
const bubble = { width: 340, height: 200 };

describe('tour bubble placement', () => {
  it('goes beside a side panel, on the side with room, with the arrow at the target middle', () => {
    const place = placeBubble(rect(0, 64, 340, 836), bubble, viewport);
    expect(place.placement).toBe('right');
    expect(place.left).toBe(340 + 14);
    expect(place.arrow).toBe(Math.round(64 + 418 - place.top));
  });

  it('goes left of a right-hand panel and below a header button', () => {
    expect(placeBubble(rect(1040, 64, 360, 836), bubble, viewport).placement).toBe('left');
    expect(placeBubble(rect(1300, 10, 40, 40), bubble, viewport).placement).toBe('bottom');
  });

  it('floats inside an area that leaves no room around it, and stays on screen', () => {
    const place = placeBubble(rect(-8, -8, 1416, 916), bubble, viewport);
    expect(place.placement).toBe('inside');
    expect(place.left).toBeGreaterThanOrEqual(12);
    expect(place.top + bubble.height).toBeLessThanOrEqual(viewport.height - 12);
  });
});

describe('tour memory', () => {
  const memory = (initial = {}) => {
    const data = { ...initial };
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  };

  it('is unseen until marked, and treats blocked storage as unseen', () => {
    expect(tourSeen(memory())).toBe(false);
    expect(tourSeen(memory({ [TOUR_KEY]: 'done' }))).toBe(true);
    expect(tourSeen({ getItem() { throw new Error('blocked'); } })).toBe(false);
    expect(tourSeen(null)).toBe(false);
  });
});

describe('tour text', () => {
  it('has a title and body for every step in Hebrew and English', () => {
    for (const strings of Object.values(TOUR_STRINGS)) {
      for (const step of TOUR_STEPS) {
        const [title, body] = strings.steps[step.id];
        expect(title).toBeTruthy();
        expect(body).toBeTruthy();
      }
      expect(strings.progress(2, 4)).toMatch(/2.*4/);
    }
  });
});
