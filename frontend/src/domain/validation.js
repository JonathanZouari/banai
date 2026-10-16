// Structural validation. Issue ORDER is part of the parity contract with
// backend/app/domain/validation.py:
//   1 schema  2 unique ids  3 partition count  4 ranges  5 width sum
//   6 per-compartment bounds/overlaps  7 doors  8 catalog refs
// Rendering/data-safety checks only, never manufacturing rules.

import { catalogIds } from './catalog.js';
import { LIMITS, SHOE_TIER } from './defaults.js';
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
    for (const [ii, item] of compartment.inserts.entries()) yield [`compartments[${ci}].inserts[${ii}].id`, item.id];
  }
  for (const [pi, partition] of design.partitions.entries()) yield [`partitions[${pi}].id`, partition.id];
  for (const [di, door] of design.doors.items.entries()) yield [`doors.items[${di}].id`, door.id];
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
    [design.carcass.plinthHeight, 'plinthHeight', 'carcass.plinthHeight'],
    [design.compartments.length, 'compartmentCount', 'compartments'],
  ];
  if (design.doors.type === 'sliding') checks.push([design.doors.items.length, 'slidingDoorCount', 'doors.items']);
  design.partitions.forEach((p, pi) => checks.push([p.thickness, 'partitionThickness', `partitions[${pi}].thickness`]));
  design.compartments.forEach((c, ci) => checks.push([c.width, 'compartmentWidth', `compartments[${ci}].width`]));
  design.compartments.forEach((c, ci) => {
    c.shelves.forEach((s, si) => checks.push([s.thickness, 'shelfThickness', `compartments[${ci}].shelves[${si}].thickness`]));
    c.drawers.forEach((d, di) => checks.push([d.height, 'drawerHeight', `compartments[${ci}].drawers[${di}].height`]));
    c.inserts.forEach((item, ii) => {
      if (item.tiers !== null) checks.push([item.tiers, 'shoeTiers', `compartments[${ci}].inserts[${ii}].tiers`]);
      if (item.height !== null) checks.push([item.height, 'insertHeight', `compartments[${ci}].inserts[${ii}].height`]);
    });
  });
  const site = design.site ?? {};
  for (const field of ['ceiling', 'niche']) {
    if (site[field] !== null && site[field] !== undefined) checks.push([site[field], field, `site.${field}`]);
  }
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
  issues.push(...checkInserts(compartment, base, top, spans));
  return issues;
}

// Which of y/tiers/height each insert type takes (the rest must be null).
const INSERT_FIELDS = { shoes: ['y', 'tiers'], trousers: ['y', 'height'], pulldown: ['y'], led: [] };

function checkInserts(compartment, base, top, spans) {
  const issues = [];
  const seen = new Set();
  const zones = []; // [start, end, path] of the inserts that take an interior zone
  compartment.inserts.forEach((item, ii) => {
    const path = `${base}.inserts[${ii}]`;
    const wanted = INSERT_FIELDS[item.type];
    const wrong = ['y', 'tiers', 'height'].find((f) => (item[f] !== null) !== wanted.includes(f));
    if (wrong) {
      issues.push(new DomainError(E.INSERT_INVALID, `${path}.${wrong}`,
        `${item.type} inserts ${wanted.includes(wrong) ? 'need' : 'have no'} ${wrong}`));
      return;
    }
    if (seen.has(item.type)) {
      issues.push(new DomainError(E.INSERT_INVALID, `${path}.type`, 'only one insert of each type per compartment'));
      return;
    }
    seen.add(item.type);
    if (item.type === 'shoes' || item.type === 'trousers') {
      const start = item.y;
      const end = start + (item.type === 'shoes' ? item.tiers * SHOE_TIER : item.height);
      if (start < 0 || end > top) {
        issues.push(new DomainError(E.OUT_OF_BOUNDS, `${path}.y`, `spans ${start}..${end} outside interior 0..${top}`));
      }
      const hit = [...spans, ...zones].find(([s, e]) => start < e && s < end);
      if (hit) issues.push(new DomainError(E.OVERLAP, path, `overlaps ${hit[2]}`));
      zones.push([start, end, path]);
    } else if (item.type === 'pulldown') {
      if (item.y < 0 || item.y > top) {
        issues.push(new DomainError(E.OUT_OF_BOUNDS, `${path}.y`, `rail at ${item.y} outside interior 0..${top}`));
      }
      const hit = [...spans, ...zones].find(([s, e]) => s < item.y && item.y < e);
      if (hit) issues.push(new DomainError(E.OVERLAP, path, `rail is inside ${hit[2]}`));
    }
  });
  compartment.rails.forEach((r, ri) => {
    const hit = zones.find(([s, e]) => s < r.y && r.y < e);
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
      [['compartmentIds', door.compartmentIds.length > 0], ['hingeSide', door.hingeSide !== null]]
        .filter(([, invalid]) => invalid)
        .map(([field]) => new DomainError(E.DOOR_INVALID, `doors.items[${i}].${field}`, `sliding doors have no ${field}`)));
  }
  return checkHinged(design);
}

function checkHinged(design) {
  const indexOf = new Map(design.compartments.map((c, i) => [c.id, i]));
  // A compartment may carry two leaves (a split), when both doors cover only that compartment.
  const coverCount = new Map();
  const singleCover = new Map();
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
      else if (ids.some((id) => coverCount.has(id))) {
        const pair = ids.length === 1 && coverCount.get(ids[0]) === 1 && singleCover.get(ids[0]);
        if (!pair) problem = 'a compartment is already covered by another door';
      }
    }
    if (problem) issues.push(new DomainError(E.DOOR_INVALID, `${path}.compartmentIds`, problem));
    ids.forEach((id) => {
      coverCount.set(id, (coverCount.get(id) ?? 0) + 1);
      if (!singleCover.has(id)) singleCover.set(id, ids.length === 1);
    });
  });
  return issues;
}

function checkCatalog(design, catalog) {
  const known = catalogIds(catalog);
  const owners = [
    ['carcass.appearance', design.carcass.appearance],
    ['doors.appearance', design.doors.appearance],
    ...design.doors.items.map((d, i) => [`doors.items[${i}].appearance`, d.appearance]),
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
