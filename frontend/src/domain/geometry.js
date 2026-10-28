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

/**
 * Read-only totals for the design summary card (frontend only; not an op, so no backend mirror).
 * Volume is gross: inner width × interior height × full depth per compartment, before shelves and
 * drawers. The model has no back panel. Hanging length counts every rail, so a double-hanging
 * compartment counts its width twice.
 */
export function designSummary(d) {
  const height = interiorHeight(d);
  const { depth } = d.dimensions;
  const count = (key) => sum(d.compartments.map((c) => c[key].length));
  return {
    compartments: d.compartments.length,
    shelves: count('shelves'),
    drawers: count('drawers'),
    rails: count('rails'),
    interiorVolumeMm3: sum(d.compartments.map((c) => c.width * height * depth)),
    hangingLengthMm: sum(d.compartments.map((c) => c.width * c.rails.length)),
  };
}

export function compartmentXRanges(d) {
  let x = 0;
  return d.compartments.map((compartment, index) => {
    const range = [x, x + compartment.width];
    x += compartment.width + (index < d.partitions.length ? d.partitions[index].thickness : 0);
    return range;
  });
}
