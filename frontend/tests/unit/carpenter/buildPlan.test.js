import { describe, expect, it } from 'vitest';
import { buildPlan, hingesFor } from '../../../src/carpenter/buildPlan.js';
import { buildCarpenterPdf, latin } from '../../../src/carpenter/pdf.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const part = (plan, name) => plan.cutList.filter((p) => p.name === name);

describe('buildPlan', () => {
  const plan = buildPlan(basic, catalog);

  it('sizes the carcass panels from the design dimensions', () => {
    const { width, height, depth } = basic.dimensions;
    const t = basic.carcass.panelThickness;
    expect(part(plan, 'Side panel')[0]).toMatchObject({ qty: 2, length: height, width: depth, thickness: t });
    expect(part(plan, 'Top panel')[0]).toMatchObject({ length: width - 2 * t, width: depth });
    expect(part(plan, 'Back panel')[0]).toMatchObject({ length: width - 2 * t, width: height - 2 * t });
  });

  it('lists every shelf and partition of the design', () => {
    const shelves = basic.compartments.reduce((n, c) => n + c.shelves.length, 0);
    expect(part(plan, 'Shelf').reduce((n, p) => n + p.qty, 0)).toBe(shelves);
    expect(part(plan, 'Partition').reduce((n, p) => n + p.qty, 0)).toBe(basic.partitions.length);
  });

  it('adds hinges and handles for hinged doors', () => {
    const hinges = plan.hardware.find((h) => h.name === 'Concealed hinge');
    expect(hinges.qty).toBe(basic.doors.items.length * hingesFor(basic.dimensions.height - 2 * basic.carcass.panelThickness - 4));
    expect(part(plan, 'Door').reduce((n, p) => n + p.qty, 0)).toBe(basic.doors.items.length);
  });

  it('gives unique references and numbered steps', () => {
    const refs = plan.cutList.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(plan.steps.length).toBeGreaterThan(4);
  });
});

describe('carpenter PDF', () => {
  it('replaces characters the standard PDF fonts cannot print', () => {
    expect(latin('Oak אוק')).toBe('Oak ???');
  });

  it('builds a multi-page document without an image', () => {
    const doc = buildCarpenterPdf({ design: basic, catalog, imageDataUrl: null, imageSize: null });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
  });
});
