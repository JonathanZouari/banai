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

const countItems = (d, key) => sum(d.compartments.map((c) => c[key].length));

/** Component counts shared by both summary views. */
export const componentCounts = (d) => ({
  compartments: d.compartments.length,
  shelves: countItems(d, 'shelves'),
  drawers: countItems(d, 'drawers'),
  rails: countItems(d, 'rails'),
});

/**
 * Interior figures for the design summary. Display-only (not an op), so it has no backend mirror.
 * ASSUMPTION: the volume is gross (shelves and drawers are not subtracted) and uses the full
 * depth, because the back panel is visual only, not part of the schema. A rail spans the
 * width of its compartment, so the hanging length is the width of each compartment per rail.
 */
export function interiorSummary(d) {
  const height = interiorHeight(d);
  const compartmentWidths = d.compartments.map((c) => c.width);
  return {
    width: interiorWidth(d),
    height,
    depth: d.dimensions.depth,
    compartmentWidths,
    volumeLitres: (sum(compartmentWidths) * height * d.dimensions.depth) / 1e6,
    hangingLengthMm: sum(d.compartments.map((c) => c.width * c.rails.length)),
    ...componentCounts(d),
  };
}

/** Exterior figures for the design summary (display-only, like interiorSummary). */
export function exteriorSummary(d) {
  const { width, height, depth } = d.dimensions;
  return {
    width,
    height,
    depth,
    panelThickness: d.carcass.panelThickness,
    footprintM2: (width * depth) / 1e6,
    doorType: d.doors.type,
    doorCount: d.doors.items.length,
    ...componentCounts(d),
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
