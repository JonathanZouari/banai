// Structural validation. Issue ORDER is part of the parity contract with
// backend/app/domain/validation.py:
//   1 schema  2 unique ids  3 partition count  4 ranges  5 width sum
//   6 per-compartment bounds/overlaps  7 doors (then door-shelf bounds/overlaps)  8 catalog refs
// Rendering/data-safety checks only, never manufacturing rules.

import { catalogIds } from './catalog.js';
import { DOOR_SHELF_THICKNESS, LIMITS } from './defaults.js';
import * as E from './errors.js';
import { DomainError } from './errors.js';
import { interiorHeight, interiorWidth } from './geometry.js';
import { parseDesign } from './schema.js';
import { ITEM_KINDS, sum } from './util.js';

/** Validate a design. `catalog = null` skips the catalog-reference check. */
export function validateDesign(data, catalog) {
  let design;
  try {
    design = parseDesign(data);
  } catch (error) {
    if (error instanceof DomainError) return [error];
    throw error;
  }
  return validateCanonical(design, catalog);
}

/** Rules 2-8 on a design that already passed parseDesign. */
export function validateCanonical(design, catalog) {
  const issues = [...checkUniqueIds(design)];
  const partitionCountOk = design.partitions.length === design.compartments.length - 1;
  if (!partitionCountOk) {
    issues.push(new DomainError(E.WIDTH_MISMATCH, 'partitions',
      'there must be exactly one partition between adjacent compartments'));
  }
  issues.push(...checkRanges(design));
  if (partitionCountOk) issues.push(...checkWidthSum(design));
  design.compartments.forEach((_, index) => issues.push(...checkCompartment(design, index)));
  issues.push(...checkDoors(design));
  if (catalog !== null && catalog !== undefined) issues.push(...checkCatalog(design, catalog));
  return issues;
}

function* iterIds(design) {
  for (const [ci, compartment] of design.compartments.entries()) {
    yield [`compartments[${ci}].id`, compartment.id];
    for (const kind of ITEM_KINDS) {
      for (const [ii, item] of compartment[kind].entries()) yield [`compartments[${ci}].${kind}[${ii}].id`, item.id];
    }
  }
  for (const [pi, partition] of design.partitions.entries()) yield [`partitions[${pi}].id`, partition.id];
  for (const [di, door] of design.doors.items.entries()) {
    yield [`doors.items[${di}].id`, door.id];
    for (const [si, shelf] of door.shelves.entries()) yield [`doors.items[${di}].shelves[${si}].id`, shelf.id];
  }
}

function checkUniqueIds(design) {
  const seen = new Set();
  const issues = [];
  for (const [path, id] of iterIds(design)) {
    if (seen.has(id)) issues.push(new DomainError(E.DUPLICATE_ID, path, 'this id is already used'));
    seen.add(id);
  }
  return issues;
}

export function rangeIssue(value, limit, path) {
  const [low, high] = LIMITS[limit];
  if (value >= low && value <= high) return null;
  return new DomainError(E.OUT_OF_RANGE, path, `${value} is outside [${low}, ${high}]`);
}

function checkRanges(design) {
  const checks = [
    [design.dimensions.width, 'width', 'dimensions.width'],
    [design.dimensions.height, 'height', 'dimensions.height'],
    [design.dimensions.depth, 'depth', 'dimensions.depth'],
    [design.carcass.panelThickness, 'panelThickness', 'carcass.panelThickness'],
    [design.compartments.length, 'compartmentCount', 'compartments'],
  ];
  if (design.doors.type === 'sliding') checks.push([design.doors.items.length, 'slidingDoorCount', 'doors.items']);
  design.partitions.forEach((p, pi) => checks.push([p.thickness, 'partitionThickness', `partitions[${pi}].thickness`]));
  design.compartments.forEach((c, ci) => checks.push([c.width, 'compartmentWidth', `compartments[${ci}].width`]));
  design.compartments.forEach((c, ci) => {
    c.shelves.forEach((s, si) => checks.push([s.thickness, 'shelfThickness', `compartments[${ci}].shelves[${si}].thickness`]));
    c.drawers.forEach((d, di) => checks.push([d.height, 'drawerHeight', `compartments[${ci}].drawers[${di}].height`]));
  });
  design.doors.items.forEach((d, di) => d.shelves.forEach((s, si) =>
    checks.push([s.depth, 'doorShelfDepth', `doors.items[${di}].shelves[${si}].depth`])));
  return checks.map(([value, limit, path]) => rangeIssue(value, limit, path)).filter(Boolean);
}

function checkWidthSum(design) {
  const used = sum(design.compartments.map((c) => c.width)) + sum(design.partitions.map((p) => p.thickness));
  const available = interiorWidth(design);
  if (used === available) return [];
  return [new DomainError(E.WIDTH_MISMATCH, 'compartments',
    `compartments and partitions use ${used} mm but the interior is ${available} mm`)];
}

function checkCompartment(design, ci) {
  const compartment = design.compartments[ci];
  const top = interiorHeight(design);
  const base = `compartments[${ci}]`;
  const issues = [];
  const spans = [];
  for (const [kind, sizeKey] of [['shelves', 'thickness'], ['drawers', 'height']]) {
    compartment[kind].forEach((item, ii) => {
      const start = item.y;
      const end = item.y + item[sizeKey];
      if (start < 0 || end > top) {
        issues.push(new DomainError(E.OUT_OF_BOUNDS, `${base}.${kind}[${ii}].y`, `spans ${start}..${end} outside interior 0..${top}`));
      }
      spans.push([start, end, `${base}.${kind}[${ii}]`]);
    });
  }
  compartment.rails.forEach((r, ri) => {
    if (r.y < 0 || r.y > top) {
      issues.push(new DomainError(E.OUT_OF_BOUNDS, `${base}.rails[${ri}].y`, `rail at ${r.y} outside interior 0..${top}`));
    }
  });
  spans.forEach(([startJ, endJ, pathJ], j) => {
    const hit = spans.slice(0, j).find(([startI, endI]) => startJ < endI && startI < endJ);
    if (hit) issues.push(new DomainError(E.OVERLAP, pathJ, `overlaps ${hit[2]}`));
  });
  compartment.rails.forEach((r, ri) => {
    const hit = spans.find(([start, end]) => start < r.y && r.y < end);
    if (hit) issues.push(new DomainError(E.OVERLAP, `${base}.rails[${ri}]`, `rail is inside ${hit[2]}`));
  });
  return issues;
}

function checkDoors(design) {
  const { type, items } = design.doors;
  if (type === 'none') {
    return items.length ? [new DomainError(E.DOOR_INVALID, 'doors.items', "type 'none' must have no doors")] : [];
  }
  if (!items.length) return [new DomainError(E.DOOR_INVALID, 'doors.items', `${type} doors need at least one door`)];
  if (type === 'sliding') {
    return items.flatMap((door, i) =>
      [['compartmentIds', door.compartmentIds.length > 0], ['hingeSide', door.hingeSide !== null], ['shelves', door.shelves.length > 0]]
        .filter(([, invalid]) => invalid)
        .map(([field]) => new DomainError(E.DOOR_INVALID, `doors.items[${i}].${field}`, `sliding doors have no ${field}`)));
  }
  return [...checkHinged(design), ...checkDoorShelves(design)];
}

// Door shelves stay within the interior height and don't overlap on the same door.
function checkDoorShelves(design) {
  const top = interiorHeight(design);
  const issues = [];
  design.doors.items.forEach((door, di) => {
    const spans = [];
    door.shelves.forEach((shelf, si) => {
      const path = `doors.items[${di}].shelves[${si}]`;
      const start = shelf.y;
      const end = shelf.y + DOOR_SHELF_THICKNESS;
      if (start < 0 || end > top) issues.push(new DomainError(E.OUT_OF_BOUNDS, `${path}.y`, `spans ${start}..${end} outside interior 0..${top}`));
      const hit = spans.find(([s, e]) => start < e && s < end);
      if (hit) issues.push(new DomainError(E.OVERLAP, path, `overlaps ${hit[2]}`));
      spans.push([start, end, path]);
    });
  });
  return issues;
}

function checkHinged(design) {
  const indexOf = new Map(design.compartments.map((c, i) => [c.id, i]));
  const covered = new Set();
  const issues = [];
  design.doors.items.forEach((door, di) => {
    const path = `doors.items[${di}]`;
    if (door.hingeSide === null) issues.push(new DomainError(E.DOOR_INVALID, `${path}.hingeSide`, 'hinged doors need a hinge side'));
    const ids = door.compartmentIds;
    let problem = null;
    if (!ids.length) problem = 'a hinged door must cover at least one compartment';
    else if (ids.some((id) => !indexOf.has(id))) problem = 'references an unknown compartment';
    else {
      const positions = ids.map((id) => indexOf.get(id));
      if (positions.some((p, k) => p !== positions[0] + k)) problem = 'compartments must be adjacent and ordered left to right';
      else if (ids.some((id) => covered.has(id))) problem = 'a compartment is already covered by another door';
    }
    if (problem) issues.push(new DomainError(E.DOOR_INVALID, `${path}.compartmentIds`, problem));
    ids.forEach((id) => covered.add(id));
  });
  return issues;
}

function checkCatalog(design, catalog) {
  const known = catalogIds(catalog);
  const owners = [
    ['carcass.appearance', design.carcass.appearance],
    ['doors.appearance', design.doors.appearance],
    ...design.doors.items.map((d, i) => [`doors.items[${i}].appearance`, d.appearance]),
    ...design.doors.items.flatMap((d, i) => d.shelves.map((s, si) => [`doors.items[${i}].shelves[${si}].appearance`, s.appearance])),
  ];
  design.compartments.forEach((c, ci) => {
    for (const kind of ['shelves', 'drawers']) {
      c[kind].forEach((item, i) => owners.push([`compartments[${ci}].${kind}[${i}].appearance`, item.appearance]));
    }
  });
  const issues = [];
  for (const [path, appearance] of owners) {
    if (appearance === null) continue;
    for (const field of ['material', 'color', 'finish']) {
      const ref = appearance[field];
      if ('catalogId' in ref && !known[field].has(ref.catalogId)) {
        issues.push(new DomainError(E.UNKNOWN_CATALOG_ID, `${path}.${field}`, `unknown catalog ${field}`));
      }
    }
  }
  return issues;
}
