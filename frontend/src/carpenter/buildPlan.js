// Pure design -> carpenter's build plan (cut list, hardware, assembly steps). No DOM, no PDF.
// ASSUMPTION: panel sizes mirror what the 3D viewer draws (see viewer/units.js VISUAL). They are
// prototype values for a first brief to a carpenter, not a manufacturing specification.
import { compartmentXRanges, interiorHeight, interiorWidth } from '../domain/geometry.js';
import { VISUAL } from '../viewer/units.js';

const round1 = (mm) => Math.round(mm * 10) / 10;

/** Human text for an appearance: "Melamine, White, Matte" (custom values are marked). */
export function describeAppearance(appearance, catalog) {
  const name = (section, ref) => (ref.custom ? `${ref.name} (custom)` : catalog[section].find((e) => e.id === ref.catalogId)?.name ?? ref.catalogId);
  return [name('materials', appearance.material), name('colors', appearance.color), name('finishes', appearance.finish)].join(', ');
}

/** Number of hinges per door by door height (rule of thumb, a suggestion only). */
export const hingesFor = (heightMm) => (heightMm <= 900 ? 2 : heightMm <= 1600 ? 3 : heightMm <= 2200 ? 4 : 5);

function mergeParts(parts) {
  const merged = new Map();
  for (const part of parts) {
    const key = [part.name, part.length, part.width, part.thickness, part.material].join('|');
    const found = merged.get(key);
    if (found) {
      found.qty += part.qty;
      if (part.where) found.where = [found.where, part.where].filter(Boolean).join('; ');
    } else {
      merged.set(key, { ...part });
    }
  }
  return [...merged.values()].map((part, index) => ({ ...part, ref: String.fromCharCode(65 + (index % 26)) + (index >= 26 ? Math.floor(index / 26) : '') }));
}

export function buildPlan(design, catalog) {
  const { width, height, depth } = design.dimensions;
  const t = design.carcass.panelThickness;
  const body = describeAppearance(design.carcass.appearance, catalog);
  const innerW = interiorWidth(design);
  const innerH = interiorHeight(design);
  const innerD = depth - VISUAL.backThickness;
  const ranges = compartmentXRanges(design);
  const parts = [];
  const add = (name, qty, length, width_, thickness, material, where = '') =>
    parts.push({ name, qty, length: round1(length), width: round1(width_), thickness, material, where });

  add('Side panel', 2, height, depth, t, body, 'Left and right, full height');
  add('Top panel', 1, innerW, depth, t, body, 'Between the sides');
  add('Bottom panel', 1, innerW, depth, t, body, 'Between the sides');
  add('Back panel', 1, innerW, innerH, VISUAL.backThickness, body, 'Fixed to the rear of the carcass');
  design.partitions.forEach((p, i) => add('Partition', 1, innerH, innerD, p.thickness, body, `Between compartments ${i + 1} and ${i + 2}`));

  design.compartments.forEach((c, i) => {
    const label = `Compartment ${i + 1}`;
    c.shelves.forEach((s) => add('Shelf', 1, c.width, innerD, s.thickness, describeAppearance(s.appearance ?? design.carcass.appearance, catalog), `${label}, top face ${t + s.y} mm above floor`));
    c.drawers.forEach((d) => add('Drawer front', 1, c.width - 2 * VISUAL.drawerGap, d.height - 2 * VISUAL.drawerGap, t, describeAppearance(d.appearance ?? design.carcass.appearance, catalog), `${label}, bottom edge ${t + d.y} mm above floor`));
  });

  const hardware = [];
  const doorHeight = innerH - 2 * VISUAL.doorGap;
  const doorMaterial = (door) => describeAppearance(door.appearance ?? design.doors.appearance, catalog);
  if (design.doors.type === 'hinged') {
    design.doors.items.forEach((door) => {
      const x0 = ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds[0])][0];
      const x1 = ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1))][1];
      const doorW = x1 - x0 - 2 * VISUAL.doorGap;
      add('Door', 1, doorHeight, doorW, VISUAL.doorThickness, doorMaterial(door), `Hinged ${door.hingeSide}, covers compartment${door.compartmentIds.length > 1 ? 's' : ''} ${door.compartmentIds.map((id) => design.compartments.findIndex((c) => c.id === id) + 1).join(', ')}`);
    });
    hardware.push({ name: 'Concealed hinge', qty: design.doors.items.length * hingesFor(doorHeight), note: `${hingesFor(doorHeight)} per door (suggested by door height)` });
    hardware.push({ name: 'Door handle', qty: design.doors.items.length, note: 'Vertical bar, on the edge opposite the hinge' });
  } else if (design.doors.type === 'sliding') {
    const count = design.doors.items.length;
    const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
    const panelW = (innerW + (count - 1) * overlap) / count;
    design.doors.items.forEach((door, i) => add('Sliding door panel', 1, doorHeight, panelW, VISUAL.doorThickness, doorMaterial(door), `Panel ${i + 1} of ${count}, runs in the ${i % 2 === 1 ? 'front' : 'back'} track`));
    hardware.push({ name: 'Sliding track (top + bottom)', qty: 2, note: `Two-track, ${innerW} mm long each` });
    hardware.push({ name: 'Door pull handle', qty: count, note: 'Vertical pull on each panel' });
  }
  design.compartments.forEach((c, i) => {
    c.rails.forEach((r) => hardware.push({ name: 'Hanging rail', qty: 1, note: `Compartment ${i + 1}, ${c.width} mm long, centre ${t + r.y} mm above floor` }));
    if (c.drawers.length) hardware.push({ name: 'Drawer runners (pair)', qty: c.drawers.length, note: `Compartment ${i + 1}, for ${c.width - 2 * VISUAL.drawerGap} mm wide drawers` });
  });
  hardware.push({ name: 'Cam/dowel or screw set', qty: 1, note: 'Enough for all panel joints' });
  hardware.push({ name: 'Adjustable feet or plinth', qty: 1, note: 'Optional, to level on uneven floors' });

  const cutList = mergeParts(parts);
  const ref = (name) => cutList.filter((p) => p.name === name).map((p) => p.ref).join(', ');
  const steps = [
    `Cut all panels to the sizes in the cut list. Mark each one with its reference letter and edge-band the visible edges.`,
    `Lay the two side panels (${ref('Side panel')}) flat. Fix the bottom (${ref('Bottom panel')}) and top (${ref('Top panel')}) panels between them to form a rectangular carcass ${width} x ${height} x ${depth} mm.`,
    `Check the carcass is square (equal diagonals) before fixing the back panel (${ref('Back panel')}).`,
    ...(design.partitions.length ? [`Fix the ${design.partitions.length} partition(s) (${ref('Partition')}) vertically at the positions in the compartment table. Compartment widths are measured between inner faces.`] : []),
    ...(cutList.some((p) => p.name === 'Shelf') ? [`Fit the shelves (${ref('Shelf')}) at the heights listed. Heights are measured from the floor to the top face of the shelf.`] : []),
    ...(cutList.some((p) => p.name === 'Drawer front') ? [`Build each drawer box to fit its opening, mount the runners, and fix the drawer fronts (${ref('Drawer front')}) leaving a ${VISUAL.drawerGap} mm gap on every side.`] : []),
    ...(design.compartments.some((c) => c.rails.length) ? [`Mount the hanging rails at the heights listed.`] : []),
    ...(design.doors.type === 'hinged' ? [`Hang the doors (${ref('Door')}) with a ${VISUAL.doorGap} mm gap around each. Fit the handles on the free edge, then adjust the hinges.`] : []),
    ...(design.doors.type === 'sliding' ? [`Fix the top and bottom tracks, then hang the sliding panels (${ref('Sliding door panel')}) alternating between the back and front track. Adjacent panels overlap by ${VISUAL.slidingOverlap} mm.`] : []),
    `Move the wardrobe into place, level it, and fix it to the wall if required.`,
  ];

  const compartments = design.compartments.map((c, i) => ({
    index: i + 1,
    width: c.width,
    shelves: c.shelves.map((s) => ({ y: t + s.y, thickness: s.thickness })),
    drawers: c.drawers.map((d) => ({ y: t + d.y, height: d.height })),
    rails: c.rails.map((r) => ({ y: t + r.y })),
  }));

  return {
    overall: { width, height, depth },
    panelThickness: t,
    bodyMaterial: body,
    doorType: design.doors.type,
    doorMaterial: design.doors.type === 'none' ? null : describeAppearance(design.doors.appearance, catalog),
    compartments,
    cutList,
    hardware,
    steps,
    notes: [
      'Illustrative brief generated by BanAI. All dimensions are in millimetres.',
      `Door gap ${VISUAL.doorGap} mm, back panel ${VISUAL.backThickness} mm, door thickness ${VISUAL.doorThickness} mm are default prototype values.`,
      'This is not a manufacturing or feasibility check. The carpenter should verify sizes, load, joints and hardware before cutting.',
    ],
  };
}
