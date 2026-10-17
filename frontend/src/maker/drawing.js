// To-scale SVG drawings for the cabinetmaker sheet: a front elevation (doors removed, hinge
// swing shown with the usual dashed notation) and a side section with the System 32 hole rows.
// Built with createElementNS and textContent only. SVG units are millimetres; y is flipped so
// the floor is at the bottom.
import { frameOf } from '../viewer/builders/frame.js';
import { VISUAL } from '../viewer/units.js';
import { STANDARDS } from './standards.js';

const NS = 'http://www.w3.org/2000/svg';
const cm = (mm) => (mm / 10).toFixed(1);

function factory(doc) {
  const node = (tag, attrs = {}, text) => {
    const element = doc.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  };
  return node;
}

function svgRoot(node, width, height, margin, label) {
  const svg = node('svg', {
    viewBox: `${-margin} ${-margin} ${width + 2 * margin} ${height + 2 * margin}`,
    role: 'img', 'aria-label': label, 'font-family': 'Arial, sans-serif',
  });
  svg.append(node('title', {}, label));
  return svg;
}

/** A dimension line with end ticks and a centred label. Horizontal when y1 === y2. */
function dimension(node, [x1, y1], [x2, y2], text, size, { offset = 0 } = {}) {
  const group = node('g', { class: 'dim' });
  const horizontal = y1 === y2;
  group.append(node('line', { x1, y1, x2, y2, stroke: '#333', 'stroke-width': size / 10 }));
  const tick = size / 2;
  [[x1, y1], [x2, y2]].forEach(([x, y]) => group.append(horizontal
    ? node('line', { x1: x, y1: y - tick, x2: x, y2: y + tick, stroke: '#333', 'stroke-width': size / 10 })
    : node('line', { x1: x - tick, y1: y, x2: x + tick, y2: y, stroke: '#333', 'stroke-width': size / 10 })));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  group.append(horizontal
    ? node('text', { x: mx, y: my - size * 0.4 + offset, 'font-size': size, 'text-anchor': 'middle' }, text)
    : node('text', { x: mx - size * 0.5, y: my, 'font-size': size, 'text-anchor': 'middle', transform: `rotate(-90 ${mx - size * 0.5} ${my})` }, text));
  return group;
}

/** Front elevation: carcass, partitions, shelves, drawers, rails and door swing. */
export function frontElevationSvg(design, doc = document) {
  const node = factory(doc);
  const frame = frameOf(design);
  const { width: W, height: H } = design.dimensions;
  const p = frame.panel;
  const size = Math.max(W, H) / 45; // label size
  const svg = svgRoot(node, W, H, size * 5, `חזית ארון ${cm(W)} על ${cm(H)} ס"מ`);
  const Y = (y) => H - y; // floor-based mm -> SVG y
  const board = { fill: '#efe6d8', stroke: '#333', 'stroke-width': size / 12 };

  svg.append(node('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff', stroke: '#333', 'stroke-width': size / 8 }));
  svg.append(node('rect', { x: 0, y: 0, width: p, height: H, ...board }));
  svg.append(node('rect', { x: W - p, y: 0, width: p, height: H, ...board }));
  svg.append(node('rect', { x: p, y: 0, width: W - 2 * p, height: p, ...board }));
  svg.append(node('rect', { x: p, y: H - p, width: W - 2 * p, height: p, ...board }));
  design.partitions.forEach((partition, i) => {
    svg.append(node('rect', { x: frame.ranges[i][1], y: Y(H - p), width: partition.thickness, height: frame.innerHeight, ...board, class: 'partition' }));
  });

  design.compartments.forEach((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    compartment.shelves.forEach((shelf) => {
      const top = p + shelf.y + shelf.thickness;
      svg.append(node('rect', { x: x0, y: Y(top), width: x1 - x0, height: shelf.thickness, ...board, class: 'shelf' }));
      svg.append(node('text', { x: x1 - size * 0.3, y: Y(top) - size * 0.3, 'font-size': size * 0.8, 'text-anchor': 'end', fill: '#555' }, `${cm(top)}`));
    });
    compartment.drawers.forEach((drawer) => {
      const g = VISUAL.drawerGap;
      const bottom = p + drawer.y + g;
      const h = drawer.height - 2 * g;
      svg.append(node('rect', { x: x0 + g, y: Y(bottom + h), width: x1 - x0 - 2 * g, height: h, fill: '#f6f1ea', stroke: '#333', 'stroke-width': size / 12, class: 'drawer' }));
      const cx = (x0 + x1) / 2;
      svg.append(node('line', { x1: cx - 60, y1: Y(bottom + h / 2), x2: cx + 60, y2: Y(bottom + h / 2), stroke: '#333', 'stroke-width': size / 5 }));
    });
    compartment.rails.forEach((rail) => {
      const y = Y(p + rail.y);
      svg.append(node('line', { x1: x0 + 20, y1: y, x2: x1 - 20, y2: y, stroke: '#666', 'stroke-width': size / 4, 'stroke-dasharray': `${size} ${size / 2}`, class: 'rail' }));
      svg.append(node('text', { x: (x0 + x1) / 2, y: y - size * 0.4, 'font-size': size * 0.8, 'text-anchor': 'middle', fill: '#555', direction: 'rtl' }, `מוט תלייה ${cm(p + rail.y)}`));
    });
    // Compartment width under the drawing.
    svg.append(dimension(node, [x0, H + size * 1.6], [x1, H + size * 1.6], cm(compartment.width), size * 0.8, { offset: size * 1.5 }));
  });

  // Hinge swing: dashed lines from the hinge-side corners to the middle of the opening edge.
  if (design.doors.type === 'hinged') {
    const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
    design.doors.items.forEach((door) => {
      const x0 = rangeOf.get(door.compartmentIds[0])[0];
      const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
      const [hinge, free] = door.hingeSide === 'right' ? [x1, x0] : [x0, x1];
      const swing = { stroke: '#b4532a', 'stroke-width': size / 10, 'stroke-dasharray': `${size / 2} ${size / 3}`, fill: 'none', class: 'door-swing' };
      svg.append(node('polyline', { points: `${hinge},${p} ${free},${H / 2} ${hinge},${H - p}`, ...swing }));
    });
  } else if (design.doors.type === 'sliding') {
    svg.append(node('text', { x: W / 2, y: H / 2, 'font-size': size * 1.2, 'text-anchor': 'middle', fill: '#b4532a', direction: 'rtl' }, `${design.doors.items.length} דלתות הזזה`));
  }

  svg.append(dimension(node, [0, -size * 2], [W, -size * 2], `${cm(W)} ס"מ`, size));
  svg.append(dimension(node, [-size * 2, 0], [-size * 2, H], `${cm(H)} ס"מ`, size));
  return svg;
}

/** Side section: depth, back, door, shelves, System 32 hole rows and the recommended plinth. */
export function sideSectionSvg(design, doc = document) {
  const node = factory(doc);
  const frame = frameOf(design);
  const { height: H, depth: D } = design.dimensions;
  const p = frame.panel;
  const doorT = design.doors.type === 'none' ? 0 : VISUAL.doorThickness;
  const plinth = STANDARDS.plinth.min;
  const total = D + doorT;
  const size = Math.max(total, H) / 24; // a tall, narrow drawing: larger labels stay readable
  const svg = svgRoot(node, total, H + plinth, size * 5, `חתך צד, עומק ${cm(D)} ס"מ`);
  const Y = (y) => H - y;
  const sys = STANDARDS.system32;

  svg.append(node('rect', { x: 0, y: 0, width: D, height: H, fill: '#efe6d8', stroke: '#333', 'stroke-width': size / 8, class: 'side' }));
  svg.append(node('rect', { x: 0, y: 0, width: VISUAL.backThickness, height: H, fill: '#999', stroke: '#333', 'stroke-width': size / 12, class: 'back' }));
  if (doorT) svg.append(node('rect', { x: D, y: p, width: doorT, height: H - 2 * p, fill: '#d9c7b0', stroke: '#333', 'stroke-width': size / 12, class: 'door' }));
  // System 32: two rows of holes, 37 mm from the front and back edges, every 32 mm.
  [D - sys.setback, sys.setback + VISUAL.backThickness].forEach((x) => {
    for (let y = p + sys.pitch; y < H - p; y += sys.pitch) {
      svg.append(node('circle', { cx: x, cy: Y(y), r: 2.5, fill: '#555', class: 'hole' }));
    }
  });
  // Recommended plinth below the model (dashed: not part of the design).
  svg.append(node('rect', { x: 50, y: H, width: D - 100, height: plinth, fill: 'none', stroke: '#b4532a', 'stroke-dasharray': `${size / 2} ${size / 3}`, 'stroke-width': size / 10, class: 'plinth' }));
  svg.append(node('text', { x: D / 2, y: H + plinth + size * 1.1, 'font-size': size * 0.8, 'text-anchor': 'middle', fill: '#b4532a', direction: 'rtl' }, 'צוקל'));
  svg.append(dimension(node, [0, -size * 2], [D, -size * 2], `${cm(D)} ס"מ`, size));
  svg.append(node('text', { x: D - sys.setback, y: -size * 0.6, 'font-size': size * 0.7, 'text-anchor': 'middle', fill: '#555' }, `${sys.setback} / ${sys.pitch}`));
  return svg;
}
