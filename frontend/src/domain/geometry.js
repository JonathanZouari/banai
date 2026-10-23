// Derived geometry; positions are never stored. Mirrors backend/app/domain/geometry.py.
// Interior coordinates: x = 0 at the inner face of the left side panel,
// y = 0 at the top face of the bottom panel.

import { sum } from './util.js';

export const interiorWidth = (d) => d.dimensions.width - 2 * d.carcass.panelThickness;
export const interiorHeight = (d) => d.dimensions.height - 2 * d.carcass.panelThickness;


/** Interior x of the left face of partitions[index]. */
export const partitionLeftEdge = (d, index) =>
  sum(d.compartments.slice(0, index + 1).map((c) => c.width)) +
  sum(d.partitions.slice(0, index).map((p) => p.thickness));

export function compartmentXRanges(d) {
  let x = 0;
  return d.compartments.map((compartment, index) => {
    const range = [x, x + compartment.width];
    x += compartment.width + (index < d.partitions.length ? d.partitions[index].thickness : 0);
    return range;
  });
}

const countOf = (d, key) => sum(d.compartments.map((c) => (c[key] ?? []).length));

/**
 * Display summary of a design (pure). Interior volume is the space between the panels and
 * partitions over the full depth; ASSUMPTION: no back-panel deduction (illustrative figure).
 * Hanging length is the total length of all rails (each spans its compartment).
 */
export function designSummary(d) {
  const clearWidth = sum(d.compartments.map((c) => c.width));
  return {
    compartments: d.compartments.length,
    shelves: countOf(d, 'shelves'),
    drawers: countOf(d, 'drawers'),
    rails: countOf(d, 'rails'),
    interiorLitres: Math.round((clearWidth * interiorHeight(d) * d.dimensions.depth) / 1e6),
    hangingLengthMm: sum(d.compartments.map((c) => (c.rails ?? []).length * c.width)),
  };
}
