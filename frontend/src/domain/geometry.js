// Derived geometry; positions are never stored. Mirrors backend/app/domain/geometry.py.
// Interior coordinates: x = 0 at the inner face of the left side panel,
// y = 0 at the top face of the bottom panel.

import { sum } from './util.js';

export const interiorWidth = (d) => d.dimensions.width - 2 * d.carcass.panelThickness;
// `?? 0`: geometry also runs on hand-built v1 objects (no plinth key) before parseDesign upgrades them.
export const interiorHeight = (d) => d.dimensions.height - 2 * d.carcass.panelThickness - (d.carcass.plinthHeight ?? 0);


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
