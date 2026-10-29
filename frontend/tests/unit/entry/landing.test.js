import { describe, expect, it } from 'vitest';
import { elevationPaths } from '../../../src/entry/landing/elevation.js';
import { insideFeatures } from '../../../src/entry/landing/inside.js';
import { beatAt, clamp, damp, sectionProgress, smoother, windowed } from '../../../src/entry/landing/motion.js';
import { STORY_BEATS } from '../../../src/entry/landing/story.js';
import { SHOWCASE_STYLE, showcaseDesign, styleOps } from '../../../src/entry/landing/wardrobe.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();

describe('landing motion helpers', () => {
  it('clamps and windows progress', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(windowed(0.5, 0.25, 0.75)).toBe(0.5);
    expect(windowed(0.1, 0.25, 0.75)).toBe(0);
    expect(windowed(0.9, 0.25, 0.75)).toBe(1);
  });

  it('eases with flat ends and a symmetric middle', () => {
    expect(smoother(0)).toBe(0);
    expect(smoother(1)).toBe(1);
    expect(smoother(0.5)).toBeCloseTo(0.5);
    expect(smoother(0.05)).toBeLessThan(0.05);
  });

  it('damps toward a target independent of frame rate', () => {
    const oneStep = damp(0, 1, 4, 0.1);
    const twoSteps = damp(damp(0, 1, 4, 0.05), 1, 4, 0.05);
    expect(oneStep).toBeGreaterThan(0);
    expect(oneStep).toBeLessThan(1);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });

  it('measures how far a pinned section has been scrolled', () => {
    expect(sectionProgress({ top: 100, height: 3000 }, 800)).toBe(0);
    expect(sectionProgress({ top: -1100, height: 3000 }, 800)).toBe(0.5);
    expect(sectionProgress({ top: -5000, height: 3000 }, 800)).toBe(1);
    expect(sectionProgress({ top: 0, height: 500 }, 800)).toBe(0);
  });

  it('picks the story beat for a progress value', () => {
    expect(beatAt(STORY_BEATS, 0)).toBe(0);
    expect(beatAt(STORY_BEATS, 0.4)).toBe(2);
    expect(beatAt(STORY_BEATS, 1)).toBe(STORY_BEATS.length - 1);
    expect(STORY_BEATS.at(-1).end).toBe(true);
  });
});

describe('landing showcase design', () => {
  const design = showcaseDesign(catalog);

  it('is the basic wardrobe in the showcase look, built through ops', () => {
    expect(design.dimensions).toEqual({ width: 2000, height: 2400, depth: 600 });
    expect(design.carcass.appearance.color.catalogId).toBe(SHOWCASE_STYLE.color);
    expect(design.doors.appearance.material.catalogId).toBe(SHOWCASE_STYLE.material);
    expect(design.doors.handles).toEqual({ style: 'long_bar', finish: 'black' });
  });

  it('accepts any catalog combination', () => {
    const style = { material: 'walnut_veneer', color: 'walnut', finish: 'satin', handle: 'knob', handleFinish: 'brass' };
    expect(styleOps(style)).toHaveLength(3);
    const styled = showcaseDesign(catalog, style);
    expect(styled.doors.handles).toEqual({ style: 'knob', finish: 'brass' });
    expect(styled.carcass.appearance.finish.catalogId).toBe('satin');
  });
});

describe('landing elevation drawing', () => {
  it('draws the outline, partitions and every interior item of the design', () => {
    const design = showcaseDesign(catalog);
    const { width, height, paths } = elevationPaths(design);
    expect([width, height]).toEqual([2000, 2400]);
    const count = (kind) => paths.filter((p) => p.kind === kind).length;
    expect(count('carcass')).toBe(3);
    expect(count('partition')).toBe(design.partitions.length);
    expect(count('shelf')).toBe(design.compartments.reduce((n, c) => n + c.shelves.length, 0));
    expect(count('drawer')).toBe(2);
    expect(count('rail')).toBe(1);
    paths.forEach((p) => expect(p.d).toMatch(/^M[\d.]+ [\d.]+/));
  });
});

describe('landing inside tour', () => {
  it('reports real values from the design and the catalog', () => {
    const design = showcaseDesign(catalog);
    const features = insideFeatures(design, catalog);
    expect(features.map((f) => f.kind)).toEqual(['rail', 'shelf', 'drawer', 'partition', 'handle']);
    const byKind = Object.fromEntries(features.map((f) => [f.kind, f.values]));
    expect(byKind.rail.mm).toBe(design.carcass.panelThickness + 1900);
    expect(byKind.shelf).toEqual({ count: 4, gap: 400 });
    expect(byKind.drawer).toEqual({ count: 2, height: 200 });
    expect(byKind.partition).toEqual({ count: 3, width: 2000 });
    expect(byKind.handle).toEqual({ styles: catalog.handleStyles.length, finishes: catalog.handleFinishes.length });
  });
});
