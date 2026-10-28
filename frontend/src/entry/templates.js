// What a template card says about its wardrobe: the size chip, feature chips and the thumbnail's
// alt text. Everything is measured from the design itself, so a chip can never claim something the
// design does not have. Pure: no DOM. Wording lives in chat/i18n.js (start).
//
// ASSUMPTION: the hanging lengths below are prototype guidance for labelling (and for the template
// tests), not rules of the app: nothing here warns about or blocks a design.

import { interiorHeight } from '../domain/geometry.js';
import { ITEM_KINDS } from '../domain/util.js';

export const TEMPLATE_GUIDE = Object.freeze({
  longHanging: 1400, // coats, dresses
  shortHanging: 900, // shirts, folded trousers
  childHanging: 700, // children's clothes
  childReach: 1200, // highest rail or shelf top a young child reaches, from the floor
});

const cm = (mm) => (mm / 10).toFixed(1).replace(/\.0$/, '');

/** Per compartment: rails with their free length below and room above, and the gaps between parts. */
export function measure(design) {
  const top = interiorHeight(design);
  const floor = design.carcass.panelThickness;
  return design.compartments.map((compartment) => {
    const spans = [
      ...compartment.shelves.map((s) => [s.y, s.y + s.thickness]),
      ...compartment.drawers.map((d) => [d.y, d.y + d.height]),
    ].sort((a, b) => a[0] - b[0]);
    const rails = compartment.rails.map((rail) => {
      const below = spans.filter(([, end]) => end <= rail.y).map(([, end]) => end);
      const above = spans.filter(([start]) => start >= rail.y).map(([start]) => start);
      const otherRailsBelow = compartment.rails.filter((r) => r.y < rail.y).map((r) => r.y);
      const ceilingBelow = Math.max(0, ...below, ...otherRailsBelow);
      return {
        id: rail.id,
        fromFloor: rail.y + floor,
        freeBelow: rail.y - ceilingBelow,
        roomAbove: Math.min(top, ...above) - rail.y,
      };
    });
    // Gaps between horizontal parts that have no rail in them (shelf spacing), floor and top included.
    const edges = [[0, 0], ...spans, [top, top]];
    const gaps = edges.slice(1).map(([start], i) => [edges[i][1], start])
      .filter(([from, to]) => to > from && !compartment.rails.some((r) => r.y >= from && r.y <= to)) // stacked drawers touch
      .map(([from, to]) => to - from);
    const shelfTops = compartment.shelves.map((s) => s.y + s.thickness + floor);
    return { id: compartment.id, rails, gaps, shelfTops };
  });
}

/** Feature keys shown as chips, in display order (at most four). */
export function templateFeatures(design) {
  const measured = measure(design);
  const rails = measured.flatMap((c) => c.rails);
  const reachable = rails.every((r) => r.fromFloor <= TEMPLATE_GUIDE.childReach)
    && measured.every((c) => c.shelfTops.every((y) => y <= TEMPLATE_GUIDE.childReach));
  const features = [];
  if (rails.length && reachable) features.push('child');
  features.push({ hinged: 'hinged', sliding: 'sliding', none: 'open' }[design.doors.type]);
  if (rails.some((r) => r.freeBelow >= TEMPLATE_GUIDE.longHanging)) features.push('long');
  if (measured.some((c) => c.rails.filter((r) => r.freeBelow >= TEMPLATE_GUIDE.shortHanging).length >= 2)) features.push('double');
  if (design.compartments.some((c) => c.drawers.length)) features.push('drawers');
  return features.slice(0, 4);
}

/** "100 × 150 × 50 cm" (width × height × depth), in the card's language. */
export function templateSize(design, start) {
  const { width, height, depth } = design.dimensions;
  return `${cm(width)} × ${cm(height)} × ${cm(depth)} ${start.cm}`;
}

const countOf = (design, kind) => design.compartments.reduce((total, c) => total + c[kind].length, 0);

/** The thumbnail's alt text: what the picture shows, from the design. */
export function templateAlt(design, start) {
  const [shelves, drawers, rails] = ITEM_KINDS.map((kind) => countOf(design, kind));
  return start.alt({
    size: templateSize(design, start),
    compartments: design.compartments.length,
    doors: design.doors.type,
    rails,
    shelves,
    drawers,
  });
}
