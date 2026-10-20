import { describe, expect, it } from 'vitest';
import { countUp, dimensionTicks, easeOut, heroTimeline, measureGeometry, spring } from '../../../src/entry/atelier/motion.js';
import { bobArt } from '../../../src/entry/atelier/bob.js';
import { ABOUT } from '../../../src/entry/about.js';
import { BOB_GREETING, START_FOOTNOTE } from '../../../src/entry/startScreen.js';
import { HERO_WARDROBE_CM } from '../../../src/entry/atelier/hero.js';

describe('atelier motion', () => {
  it('spring is critically damped: 0 before it starts, rising, never past 1', () => {
    expect(spring(-1)).toBe(0);
    expect(spring(0)).toBe(0);
    expect(spring(Number.NaN)).toBe(0);
    let previous = 0;
    for (let t = 0.05; t < 3; t += 0.05) {
      const value = spring(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(spring(2)).toBeGreaterThan(0.999);
  });

  it('easeOut clamps its progress and countUp lands exactly on the target', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeCloseTo(0.875);
    expect(countUp(1284, 0)).toBe(0);
    expect(countUp(1284, 1)).toBe(1284);
    expect(countUp(1284, 5)).toBe(1284);
    expect(countUp(31, 0.5)).toBe(27);
  });

  it('dimension ticks are perpendicular to the line and centred on its ends', () => {
    const flat = dimensionTicks(0, 10, 100, 10, 7);
    expect(flat.a).toEqual([0, 3, 0, 17]);
    expect(flat.b).toEqual([100, 3, 100, 17]);
    expect(flat.mid).toEqual([50, 10]);
    const upright = dimensionTicks(5, 0, 5, 40, 7);
    expect(upright.a.map((v) => Math.round(v))).toEqual([12, 0, -2, 0]);
    expect(dimensionTicks(3, 3, 3, 3).mid).toEqual([3, 3]); // a zero-length line does not divide by zero
  });

  it('a measure runs along the width below, or the height at the side', () => {
    expect(measureGeometry(200, 50, 'below')).toMatchObject({ w: 200, h: 28, x1: 1, y1: 14, x2: 199, y2: 14, horizontal: true });
    expect(measureGeometry(200, 50, 'side')).toMatchObject({ w: 28, h: 50, x1: 14, y1: 1, x2: 14, y2: 49, horizontal: false });
    expect(measureGeometry(0, 0).w).toBe(2); // an element not laid out yet still gets a valid box
  });

  it('the hero timeline: parts land, then the doors open, then the dimensions draw', () => {
    const t = heroTimeline(30);
    expect(t.assembled).toBeCloseTo(0.7 + 30 * 0.075 + 0.9);
    expect(t.doorsOpen).toBeGreaterThan(t.assembled);
    expect(t.dimsStart).toBeGreaterThan(t.doorsOpen);
  });

  it('the hero wardrobe is labelled with its real size in centimetres', () => {
    expect(HERO_WARDROBE_CM).toEqual({ width: 240, height: 250 });
  });
});

describe('Bob', () => {
  it('gives every instance its own gradient and clip ids', () => {
    const one = bobArt('bob-1');
    const two = bobArt('bob-2');
    const ids = (svg) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(one)).toEqual(['bob-1-glow', 'bob-1-badge']);
    expect(ids(two)).toEqual(['bob-2-glow', 'bob-2-badge']);
    expect(one).toContain('url(#bob-1-glow)');
    expect(one).toContain('url(#bob-1-badge)');
    expect(one).not.toContain('bob-2');
  });

  it('is decorative and static: hidden from assistive tech, no scripts or handlers, only generated ids', () => {
    const art = bobArt('bob-7');
    expect(art).toContain('aria-hidden="true"');
    expect(art).not.toMatch(/<script|\son[a-z]+=|javascript:/i);
    expect(() => bobArt('x" onload="alert(1)')).toThrow();
    expect(() => bobArt('bob-')).toThrow();
    expect(() => bobArt({ toString: () => 'bob-1' })).toThrow();
  });

  it('is drawn as a master carpenter: glasses and the pencil behind the ear', () => {
    const art = bobArt('bob-3');
    expect(art).toContain('bob__glasses');
    expect(art).toContain('bob__pencil');
  });
});

describe('About', () => {
  it('tells the master carpenter story and says it is fictional', () => {
    expect(ABOUT.sign).toBe('בוב · מאסטר נגר');
    expect(ABOUT.lead).toContain('בוב בנאי');
    expect(ABOUT.disclosure).toContain('בדיונית');
    expect(ABOUT.disclosure).toContain('AI');
    expect(`${ABOUT.lead}${ABOUT.text}`).not.toMatch(/צעיר|מחייך/);
  });

  it('lists four figures that match the story, and the content cannot be changed at run time', () => {
    expect(ABOUT.stats.map((s) => s.value)).toEqual([30, 1284, 20, 1]);
    expect(2026 - ABOUT.since).toBe(ABOUT.stats[0].value); // the story is set in 2026: 30 years, as the title says
    expect(ABOUT.title[0]).toContain('שלושים שנה');
    expect(Object.isFrozen(ABOUT)).toBe(true);
    expect(Object.isFrozen(ABOUT.stats[0])).toBe(true);
  });
});

describe('start screen copy', () => {
  it('keeps the manufacturing disclaimer and greets as Bob', () => {
    expect(START_FOOTNOTE).toContain('הנגר מאמת את המידות באתר');
    expect(BOB_GREETING).toContain('בוב');
  });
});
