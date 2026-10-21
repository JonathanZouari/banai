// Pure: design + catalog + language -> everything the carpenter PDF prints (parts, cutting list, steps).
// No jsPDF and no DOM here, so it is unit-tested. All lengths are integer millimetres, identical in
// both languages: only the words change (see strings.js). These are nominal, human-readable
// instructions. They are NOT engineering or manufacturing drawings and never claim the design is
// manufacturable.

import { SECTIONS } from '../domain/catalog.js';
import { compartmentXRanges, interiorHeight, interiorWidth } from '../domain/geometry.js';
import { pdfStringsFor, PDF_STRINGS } from './strings.js';

export const DISCLAIMER = PDF_STRINGS.en.disclaimer;

/** English PDF text is Latin-1 only (built-in fonts): anything else is replaced, never dropped silently. */
export const pdfText = (value) => String(value ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

function refName(ref, section, catalog, s, language) {
  if (ref.custom) return language === 'he' ? `${ref.name} (${s.custom})` : `${pdfText(ref.name)} (${s.custom})`;
  const english = catalog[SECTIONS[section]].find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId;
  return s.catalog[ref.catalogId] ?? english;
}

export const appearanceLabel = (appearance, catalog, language = 'en') => {
  const s = pdfStringsFor(language);
  return ['material', 'color', 'finish'].map((key) => refName(appearance[key], key, catalog, s, language)).join(', ');
};

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

export function buildPlan(design, catalog, language = 'en') {
  const s = pdfStringsFor(language);
  const look = (appearance) => appearanceLabel(appearance, catalog, language);
  const t = design.carcass.panelThickness;
  const { width: W, height: H, depth: D } = design.dimensions;
  const iw = interiorWidth(design);
  const ih = interiorHeight(design);
  const ranges = compartmentXRanges(design);
  const carcassLook = look(design.carcass.appearance);
  const doorsLook = design.doors.type === 'none' ? '-' : look(design.doors.appearance);
  const parts = [];
  const add = (key, part, qty, length, width, thickness, finish, note = '') => parts.push({ key, part, qty, length, width, thickness, finish, note });

  add('side', s.parts.side, 2, H, D, t, carcassLook);
  add('top', s.parts.top, 1, iw, D, t, carcassLook);
  add('bottom', s.parts.bottom, 1, iw, D, t, carcassLook);
  design.partitions.forEach((p, i) => add('partition', s.parts.partition(i + 1), 1, ih, D, p.thickness, carcassLook, s.notes.between(i + 1, i + 2)));
  design.compartments.forEach((c, i) => {
    c.shelves.forEach((sh, j) => add('shelf', s.parts.shelf(`${i + 1}.${j + 1}`), 1, c.width, D, sh.thickness, look(sh.appearance ?? design.carcass.appearance), s.notes.compartment(i + 1)));
    c.drawers.forEach((d, j) => add('drawerFront', s.parts.drawerFront(`${i + 1}.${j + 1}`), 1, c.width, d.height, t, look(d.appearance ?? design.carcass.appearance), s.notes.drawer));
  });
  if (design.doors.type === 'hinged') {
    design.doors.items.forEach((door, i) => add('hingedDoor', s.parts.hingedDoor(i + 1), 1, ih, coveredWidth(design, door.compartmentIds), t, look(door.appearance ?? design.doors.appearance), s.notes.hinged(door.hingeSide)));
  } else if (design.doors.type === 'sliding') {
    const count = design.doors.items.length;
    design.doors.items.forEach((door, i) => add('slidingDoor', s.parts.slidingDoor(i + 1), 1, ih, Math.ceil(W / count), t, look(door.appearance ?? design.doors.appearance), s.notes.sliding));
  }
  design.compartments.forEach((c, i) => c.rails.forEach((r, j) => add('rail', s.parts.rail(`${i + 1}.${j + 1}`), 1, c.width, 0, 0, language === 'he' ? 'מוט' : 'rail', s.notes.rail(i + 1, r.y))));

  const steps = [s.steps.cut, s.steps.sides(H, D, iw, W), s.steps.topBottom(iw)];
  ranges.forEach((range, i) => {
    if (i < design.partitions.length) steps.push(s.steps.partition(i + 1, design.partitions[i].thickness, range[1]));
  });
  design.compartments.forEach((c, i) => {
    c.shelves.forEach((sh, j) => steps.push(s.steps.shelf(i + 1, `${i + 1}.${j + 1}`, sh.y + sh.thickness, sh.y)));
    c.drawers.forEach((d, j) => steps.push(s.steps.drawer(i + 1, `${i + 1}.${j + 1}`, d.height, d.y)));
    c.rails.forEach((r, j) => steps.push(s.steps.rail(i + 1, `${i + 1}.${j + 1}`, r.y)));
  });
  if (design.doors.type === 'hinged') steps.push(s.steps.hinged(design.doors.items.length));
  if (design.doors.type === 'sliding') steps.push(s.steps.sliding(design.doors.items.length));
  steps.push(s.steps.final);

  return {
    language,
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
