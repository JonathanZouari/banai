// Parts list for the carpenter's PDF. Pure: a design and the catalog in, plain data out.
// Sizes come from the canonical design (millimetres). Where the model has no value (back panel thickness,
// door and drawer gaps, sliding overlap) the visual prototype values are used and flagged as assumptions.
import { compartmentXRanges, interiorHeight, interiorWidth, partitionLeftEdge } from '../domain/geometry.js';
import { VISUAL } from '../viewer/units.js';

export const ASSUMPTION_NOTES = Object.freeze([
  `Back panel thickness ${VISUAL.backThickness} mm, door thickness ${VISUAL.doorThickness} mm, door gap ${VISUAL.doorGap} mm and drawer gap ${VISUAL.drawerGap} mm are prototype values, not specifications.`,
  'Joints, fixings, hinges, drawer runners and drawer box construction are not part of the design model and are left to the carpenter.',
]);

/** "Melamine board, White, Matte" (custom values use their own name or hex). */
export function describeAppearance(appearance, catalog) {
  const name = (list, ref) => {
    if (ref.custom) return ref.name ? `${ref.name} (custom)` : `${ref.hex ?? 'custom'} (custom)`;
    return list.find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId;
  };
  return [
    name(catalog.materials, appearance.material),
    name(catalog.colors, appearance.color),
    name(catalog.finishes, appearance.finish),
  ].join(', ');
}

/** Merge identical parts into one row with a quantity, keeping first-seen order. */
function group(rows) {
  const merged = new Map();
  rows.forEach((row) => {
    const key = [row.section, row.name, row.length, row.width, row.thickness, row.finish, row.note ?? ''].join('|');
    const found = merged.get(key);
    if (found) found.qty += row.qty ?? 1;
    else merged.set(key, { ...row, qty: row.qty ?? 1 });
  });
  return [...merged.values()];
}

export function buildCutList(design, catalog) {
  const { width, height, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerW = interiorWidth(design);
  const innerH = interiorHeight(design);
  const innerD = depth - VISUAL.backThickness;
  const ranges = compartmentXRanges(design);
  const carcassFinish = describeAppearance(design.carcass.appearance, catalog);
  const part = (section, name, length, partWidth, thickness, finish = carcassFinish, note) => (
    { section, name, length, width: partWidth, thickness, finish, ...(note ? { note } : {}) }
  );

  const rows = [
    part('Carcass', 'Side panel', height, depth, panel),
    part('Carcass', 'Side panel', height, depth, panel),
    part('Carcass', 'Top panel', innerW, depth, panel),
    part('Carcass', 'Bottom panel', innerW, depth, panel),
    part('Carcass', 'Back panel', innerW, height - 2 * panel, VISUAL.backThickness),
  ];
  design.partitions.forEach((partition) => rows.push(part('Interior', 'Vertical partition', innerH, innerD, partition.thickness)));

  design.compartments.forEach((compartment) => {
    const [x0, x1] = ranges[design.compartments.indexOf(compartment)];
    const inner = x1 - x0;
    compartment.shelves.forEach((shelf) => rows.push(
      part('Interior', 'Shelf', inner, innerD, shelf.thickness, describeAppearance(shelf.appearance ?? design.carcass.appearance, catalog)),
    ));
    compartment.drawers.forEach((drawer) => rows.push(
      part('Interior', 'Drawer front', inner - 2 * VISUAL.drawerGap, drawer.height - 2 * VISUAL.drawerGap, VISUAL.doorThickness,
        describeAppearance(drawer.appearance ?? design.carcass.appearance, catalog)),
    ));
    compartment.rails.forEach(() => rows.push(part('Interior', 'Hanging rail', inner, VISUAL.railRadius * 2, VISUAL.railRadius * 2, 'Metal tube, round')));
  });

  const { doors } = design;
  if (doors.type === 'hinged') {
    const doorHeight = innerH - 2 * VISUAL.doorGap;
    doors.items.forEach((door) => {
      const first = ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds[0])];
      const last = ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1))];
      rows.push(part('Doors', `Hinged door (hinge ${door.hingeSide})`, doorHeight, last[1] - first[0] - 2 * VISUAL.doorGap, VISUAL.doorThickness,
        describeAppearance(door.appearance ?? doors.appearance, catalog)));
    });
  } else if (doors.type === 'sliding') {
    const count = doors.items.length;
    const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
    const panelWidth = Math.round((innerW + (count - 1) * overlap) / count);
    doors.items.forEach((door) => rows.push(part('Doors', 'Sliding door panel', innerH - 2 * VISUAL.doorGap, panelWidth, VISUAL.doorThickness,
      describeAppearance(door.appearance ?? doors.appearance, catalog), `Overlap ${overlap} mm`)));
    rows.push({ ...part('Doors', 'Sliding track (top and bottom)', innerW, VISUAL.slidingRailHeight, VISUAL.slidingRailHeight, 'Hardware'), qty: 2 });
  }

  return {
    overall: { width, height, depth },
    interior: { width: innerW, height: innerH },
    panelThickness: panel,
    doorType: doors.type,
    appearance: {
      carcass: carcassFinish,
      doors: doors.type === 'none' ? 'No doors' : describeAppearance(doors.appearance, catalog),
    },
    parts: group(rows),
    compartments: design.compartments.map((compartment, index) => ({
      number: index + 1,
      width: compartment.width,
      shelves: compartment.shelves.map((s) => s.y),
      drawers: compartment.drawers.map((d) => ({ y: d.y, height: d.height })),
      rails: compartment.rails.map((r) => r.y),
    })),
    // x of each partition's left face, from the inside of the left side panel.
    partitions: design.partitions.map((p, index) => ({ thickness: p.thickness, x: partitionLeftEdge(design, index) })),
  };
}

export const countParts = (list) => list.parts.reduce((total, row) => total + row.qty, 0);
