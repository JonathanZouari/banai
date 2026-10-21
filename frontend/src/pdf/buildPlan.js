// Pure: design + catalog -> everything the carpenter PDF prints (parts, cutting list, steps).
// No jsPDF and no DOM here, so it is unit-tested. All lengths are integer millimetres.
// These are nominal, human-readable instructions. They are NOT engineering or manufacturing
// drawings and never claim the design is manufacturable.

import { SECTIONS } from '../domain/catalog.js';
import { compartmentXRanges, interiorHeight, interiorWidth } from '../domain/geometry.js';

export const DISCLAIMER =
  'Illustrative instructions, not engineering or manufacturing drawings. Dimensions, joinery and hardware must be verified by the carpenter.';

/** PDF text is Latin-1 only (built-in fonts): anything else is replaced, never dropped silently. */
export const pdfText = (value) => String(value ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');

function refName(ref, section, catalog) {
  if (ref.custom) return `${pdfText(ref.name)} (custom)`;
  return catalog[SECTIONS[section]].find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId;
}

export const appearanceLabel = (appearance, catalog) =>
  `${refName(appearance.material, 'material', catalog)}, ${refName(appearance.color, 'color', catalog)}, ${refName(appearance.finish, 'finish', catalog)}`;

/** Door width = the compartments it covers plus the partitions between them. */
function coveredWidth(design, compartmentIds) {
  const indexes = compartmentIds.map((id) => design.compartments.findIndex((c) => c.id === id));
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  let width = 0;
  for (let i = first; i <= last; i += 1) {
    width += design.compartments[i].width;
    if (i < last) width += design.partitions[i].thickness;
  }
  return width;
}

export function buildPlan(design, catalog) {
  const t = design.carcass.panelThickness;
  const { width: W, height: H, depth: D } = design.dimensions;
  const iw = interiorWidth(design);
  const ih = interiorHeight(design);
  const ranges = compartmentXRanges(design);
  const carcassLook = appearanceLabel(design.carcass.appearance, catalog);
  const doorsLook = design.doors.type === 'none' ? '-' : appearanceLabel(design.doors.appearance, catalog);
  const parts = [];
  const add = (part, qty, length, width, thickness, finish, note = '') => parts.push({ part, qty, length, width, thickness, finish, note });

  add('Side panel', 2, H, D, t, carcassLook);
  add('Top panel', 1, iw, D, t, carcassLook);
  add('Bottom panel', 1, iw, D, t, carcassLook);
  design.partitions.forEach((p, i) => add(`Partition ${i + 1}`, 1, ih, D, p.thickness, carcassLook, `between compartments ${i + 1} and ${i + 2}`));
  design.compartments.forEach((c, i) => {
    c.shelves.forEach((s, j) => add(`Shelf ${i + 1}.${j + 1}`, 1, c.width, D, s.thickness, appearanceLabel(s.appearance ?? design.carcass.appearance, catalog), `compartment ${i + 1}`));
    c.drawers.forEach((d, j) => add(`Drawer front ${i + 1}.${j + 1}`, 1, c.width, d.height, t, appearanceLabel(d.appearance ?? design.carcass.appearance, catalog), 'nominal size; drawer box and runners per carpenter'));
  });
  if (design.doors.type === 'hinged') {
    design.doors.items.forEach((door, i) => add(`Hinged door ${i + 1}`, 1, ih, coveredWidth(design, door.compartmentIds), t, appearanceLabel(door.appearance ?? design.doors.appearance, catalog), `nominal size; hinges on the ${door.hingeSide} side`));
  } else if (design.doors.type === 'sliding') {
    const count = design.doors.items.length;
    design.doors.items.forEach((door, i) => add(`Sliding door ${i + 1}`, 1, ih, Math.ceil(W / count), t, appearanceLabel(door.appearance ?? design.doors.appearance, catalog), 'nominal size; panels overlap on the track'));
  }
  const rails = design.compartments.flatMap((c, i) => c.rails.map((r, j) => ({ number: `${i + 1}.${j + 1}`, compartment: i + 1, y: r.y, length: c.width })));
  rails.forEach((r) => add(`Hanging rail ${r.number}`, 1, r.length, 0, 0, 'rail', `compartment ${r.compartment}; at ${r.y} mm above the bottom panel`));

  const steps = [
    `Cut the parts listed in the cutting list. Check every size against the drawing before cutting. Back panel: not modelled; the carpenter decides.`,
    `Stand the two side panels (${H} mm high, ${D} mm deep) parallel, ${iw} mm apart inside (overall width ${W} mm).`,
    `Fix the bottom panel (${iw} mm) and the top panel (${iw} mm) between the side panels. Check the carcass is square.`,
  ];
  ranges.forEach((range, i) => {
    if (i < design.partitions.length) steps.push(`Fix partition ${i + 1} (${design.partitions[i].thickness} mm thick) with its left face ${range[1]} mm from the inner face of the left side panel.`);
  });
  design.compartments.forEach((c, i) => {
    c.shelves.forEach((s, j) => steps.push(`Compartment ${i + 1}: fix shelf ${i + 1}.${j + 1} with its top face ${s.y + s.thickness} mm above the bottom panel (underside at ${s.y} mm).`));
    c.drawers.forEach((d, j) => steps.push(`Compartment ${i + 1}: build and fit drawer ${i + 1}.${j + 1}, ${d.height} mm high, with its bottom at ${d.y} mm above the bottom panel.`));
    c.rails.forEach((r, j) => steps.push(`Compartment ${i + 1}: fix hanging rail ${i + 1}.${j + 1} at ${r.y} mm above the bottom panel.`));
  });
  if (design.doors.type === 'hinged') steps.push(`Hang the ${design.doors.items.length} hinged door(s) on the sides marked in the cutting list.`);
  if (design.doors.type === 'sliding') steps.push(`Fit the track and hang the ${design.doors.items.length} sliding door panels.`);
  steps.push('Final check: square, level, all fixings tight, doors and drawers moving freely.');

  return {
    overall: { width: W, height: H, depth: D, panelThickness: t, interiorWidth: iw, interiorHeight: ih },
    doorsType: design.doors.type,
    doorCount: design.doors.items.length,
    carcassLook,
    doorsLook,
    compartmentCount: design.compartments.length,
    parts,
    steps,
  };
}
