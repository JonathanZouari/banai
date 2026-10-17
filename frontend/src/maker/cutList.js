// Cut list (רשימת חיתוך) and hardware list for the cabinetmaker sheet. Pure.
// Sizes come from the canonical design and the same derived frame the viewer uses, so the sheet,
// the editor and the 3D view always agree. All sizes are millimetres.
import { frameOf } from '../viewer/builders/frame.js';
import { VISUAL } from '../viewer/units.js';
import { STANDARDS, hingesFor, runnerLength } from './standards.js';

// Hebrew names for catalog entries; unknown ids fall back to the catalog's own name.
const HEBREW = Object.freeze({
  melamine: 'מלמין', oak_veneer: 'פורניר אלון', lacquered_mdf: 'MDF בצבע (לכה)',
  white: 'לבן', light_grey: 'אפור בהיר', anthracite: 'אנתרציט', black: 'שחור', natural_oak: 'אלון טבעי', walnut: 'אגוז',
  matte: 'מט', satin: 'סאטן', gloss: 'מבריק',
});

function refName(ref, list) {
  if (ref.custom) return ref.name;
  return HEBREW[ref.catalogId] ?? list.find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId;
}

/** "מלמין · לבן · מט" for an appearance. */
export function describeAppearance(appearance, catalog) {
  return [
    refName(appearance.material, catalog.materials),
    refName(appearance.color, catalog.colors),
    refName(appearance.finish, catalog.finishes),
  ].join(' · ');
}

function part(name, quantity, length, width, thickness, finish, edges) {
  return { name, quantity, length, width, thickness, finish, edges };
}

/** Door panels exactly as the 3D view builds them (builders/doors.js). */
function doorParts(design, frame, finishOf) {
  const { doors } = design;
  const height = frame.innerHeight - 2 * VISUAL.doorGap;
  const t = VISUAL.doorThickness;
  if (doors.type === 'hinged') {
    const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
    return doors.items.map((door, i) => {
      const x0 = rangeOf.get(door.compartmentIds[0])[0];
      const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
      const side = door.hingeSide === 'right' ? 'ימין' : 'שמאל';
      return part(`דלת ${i + 1} (ציר ${side})`, 1, height, x1 - x0 - 2 * VISUAL.doorGap, t, finishOf(door.appearance ?? doors.appearance), 4);
    });
  }
  if (doors.type === 'sliding') {
    const count = doors.items.length;
    const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
    const width = Math.floor((frame.innerWidth + (count - 1) * overlap) / count);
    return doors.items.map((door, i) => part(`דלת הזזה ${i + 1}`, 1, height, width, t, finishOf(door.appearance ?? doors.appearance), 4));
  }
  return [];
}

/** Parts to cut, grouped by kind. `edges` = how many edges get edge banding. */
export function cutList(design, catalog) {
  const frame = frameOf(design);
  const finishOf = (appearance) => describeAppearance(appearance, catalog);
  const carcass = finishOf(design.carcass.appearance);
  const { width, height, depth } = design.dimensions;
  const panel = frame.panel;
  const back = STANDARDS.backPanel;

  const parts = [
    part('דופן צד', 2, height, depth, panel, carcass, 1),
    part('תקרה / רצפה', 2, frame.innerWidth, depth, panel, carcass, 1),
    part(`גב (${back.material} ${back.min}–${back.max} מ"מ)`, 1, height, width, VISUAL.backThickness, 'לבחירת הנגר', 0),
    ...design.partitions.map((partition, i) => part(`מחיצה ${i + 1}`, 1, frame.innerHeight, frame.innerDepth, partition.thickness, carcass, 1)),
  ];
  design.compartments.forEach((compartment, ci) => {
    // Shelves of one compartment with the same size and finish are listed together.
    const groups = new Map();
    compartment.shelves.forEach((shelf) => {
      const finish = finishOf(shelf.appearance ?? design.carcass.appearance);
      const key = `${shelf.thickness}|${finish}`;
      groups.set(key, { thickness: shelf.thickness, finish, count: (groups.get(key)?.count ?? 0) + 1 });
    });
    groups.forEach(({ thickness, finish, count }) => parts.push(part(`מדף – תא ${ci + 1}`, count, compartment.width, frame.innerDepth, thickness, finish, 1)));
    compartment.drawers.forEach((drawer, di) => {
      parts.push(part(`חזית מגירה ${di + 1} – תא ${ci + 1}`, 1, compartment.width - 2 * VISUAL.drawerGap, drawer.height - 2 * VISUAL.drawerGap, panel, finishOf(drawer.appearance ?? design.carcass.appearance), 4));
    });
  });
  parts.push(...doorParts(design, frame, finishOf));
  return parts;
}

/** Edge-banding length in metres: the front edge of carcass parts, all four edges of fronts. */
export function edgeBandMetres(parts) {
  const mm = parts.reduce((total, p) => {
    if (p.edges === 4) return total + p.quantity * 2 * (p.length + p.width);
    return total + p.quantity * p.edges * p.length;
  }, 0);
  return Math.ceil(mm / 100) / 10; // rounded up to 0.1 m
}

/** Hardware (פרזול) to order. Quantities follow standards.js and must be checked per catalog. */
export function hardwareList(design) {
  const frame = frameOf(design);
  const doorHeight = frame.innerHeight - 2 * VISUAL.doorGap;
  const items = [];
  if (design.doors.type === 'hinged') {
    const perDoor = hingesFor(doorHeight);
    items.push({ name: `ציר נסתר (Clip-top / Sensys או שווה ערך), ${perDoor} לדלת בגובה ${(doorHeight / 10).toFixed(1)} ס"מ`, quantity: perDoor * design.doors.items.length });
    items.push({ name: 'ידית / פתיחת לחיצה (Push-to-open)', quantity: design.doors.items.length });
  }
  if (design.doors.type === 'sliding') {
    items.push({ name: `סט מסילות הזזה עליונה + תחתונה, באורך ${(frame.innerWidth / 10).toFixed(1)} ס"מ`, quantity: 1 });
    items.push({ name: 'גלגלות / מנגנון הזזה לדלת', quantity: design.doors.items.length });
  }
  const drawers = design.compartments.reduce((n, c) => n + c.drawers.length, 0);
  if (drawers) {
    const length = runnerLength(frame.innerDepth);
    items.push({ name: `מסילות מגירה טלסקופיות / Tandembox, באורך ${length / 10} ס"מ (זוג)`, quantity: drawers });
    items.push({ name: 'ידית מגירה', quantity: drawers });
  }
  design.compartments.forEach((compartment, ci) => {
    compartment.rails.forEach(() => {
      items.push({ name: `צינור תלייה אובלי באורך ${(compartment.width / 10).toFixed(1)} ס"מ – תא ${ci + 1}`, quantity: 1 });
      items.push({ name: 'תושבת לצינור תלייה', quantity: 2 });
    });
  });
  const shelves = design.compartments.reduce((n, c) => n + c.shelves.length, 0);
  if (shelves) items.push({ name: 'תומכי מדף (פינים) Ø5 מ"מ, 4 למדף', quantity: shelves * 4 });
  items.push({ name: 'מחברי גוף (קונפירמט / אקסצנטר)', quantity: 8 + 4 * design.partitions.length });
  if (design.dimensions.height > STANDARDS.wallAnchor.aboveHeight) items.push({ name: 'זווית / ערכת עיגון לקיר', quantity: 2 });
  items.push({ name: `קנט ${STANDARDS.edgeBand.types} ${STANDARDS.edgeBand.thickness} מ"מ`, quantity: null });
  return items;
}
