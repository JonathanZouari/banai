// Front elevation of the design (doors removed), drawn to scale as SVG with dimension lines:
// overall width and height, and each compartment's width. Pure geometry → SVG elements, built with
// DOM APIs (no innerHTML). Lengths are mm in the design and cm in the labels.
import { compartmentXRanges } from '../domain/geometry.js';
import { cm } from '../viewer/format.js';

const SVG = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 34, right: 18, bottom: 40, left: 46 }; // px around the drawing, for dimension lines

function node(tag, attrs = {}, text) {
  const element = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Scale (px per mm) and drawing size for a box of `widthPx` × `heightPx`. */
export function elevationScale(design, widthPx, heightPx) {
  const { width, height } = design.dimensions;
  const scale = Math.min((widthPx - MARGIN.left - MARGIN.right) / width, (heightPx - MARGIN.top - MARGIN.bottom) / height);
  return { scale, drawWidth: width * scale, drawHeight: height * scale };
}

function dimension(svg, { x1, y1, x2, y2, label, vertical = false }) {
  svg.append(node('line', { x1, y1, x2, y2, class: 'dim' }));
  const tick = (x, y) => (vertical
    ? node('line', { x1: x - 4, y1: y, x2: x + 4, y2: y, class: 'dim' })
    : node('line', { x1: x, y1: y - 4, x2: x, y2: y + 4, class: 'dim' }));
  svg.append(tick(x1, y1), tick(x2, y2));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  svg.append(vertical
    ? node('text', { x: mx - 8, y: my, class: 'dim-text', 'text-anchor': 'middle', transform: `rotate(-90 ${mx - 8} ${my})` }, label)
    : node('text', { x: mx, y: my - 6, class: 'dim-text', 'text-anchor': 'middle' }, label));
}

/** An <svg> front view of `design`, `widthPx` × `heightPx`. */
export function elevationSvg(design, { widthPx = 640, heightPx = 520 } = {}) {
  const { width, height } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const { scale, drawWidth, drawHeight } = elevationScale(design, widthPx, heightPx);
  const ox = MARGIN.left + ((widthPx - MARGIN.left - MARGIN.right) - drawWidth) / 2;
  const oy = MARGIN.top;
  const X = (mm) => ox + mm * scale; // outer x (mm from the left face)
  const Y = (mm) => oy + (height - mm) * scale; // outer y (mm from the floor), SVG y grows down
  const innerY = (y) => Y(panel + y); // interior y (from the top of the bottom panel)

  const svg = node('svg', { xmlns: SVG, width: widthPx, height: heightPx, viewBox: `0 0 ${widthPx} ${heightPx}`, class: 'elevation' });
  svg.append(node('style', {}, `
    .panel { fill: #efe7dc; stroke: #3d2f2a; stroke-width: 1; }
    .void { fill: #ffffff; stroke: none; }
    .shelf { fill: #d9c9b4; stroke: #3d2f2a; stroke-width: 0.8; }
    .drawer { fill: #f1e6d8; stroke: #3d2f2a; stroke-width: 0.8; }
    .rail { stroke: #6c5c55; stroke-width: 2; stroke-linecap: round; }
    .dim { stroke: #8b5037; stroke-width: 0.8; }
    .dim-text { fill: #8b5037; font: 600 11px system-ui, 'Segoe UI', Arial, sans-serif; }
  `));

  // Carcass: outer box, then the interior opening in white.
  svg.append(node('rect', { x: X(0), y: Y(height), width: drawWidth, height: drawHeight, class: 'panel' }));
  svg.append(node('rect', { x: X(panel), y: Y(height - panel), width: (width - 2 * panel) * scale, height: (height - 2 * panel) * scale, class: 'void' }));

  const ranges = compartmentXRanges(design).map(([x0, x1]) => [panel + x0, panel + x1]);
  design.partitions.forEach((partition, i) => {
    const x = ranges[i][1];
    svg.append(node('rect', { x: X(x), y: Y(height - panel), width: partition.thickness * scale, height: (height - 2 * panel) * scale, class: 'panel', 'data-kind': 'partition' }));
  });
  design.compartments.forEach((compartment, i) => {
    const [x0, x1] = ranges[i];
    const w = (x1 - x0) * scale;
    compartment.shelves.forEach((shelf) => svg.append(node('rect', { x: X(x0), y: innerY(shelf.y + shelf.thickness), width: w, height: Math.max(shelf.thickness * scale, 1), class: 'shelf', 'data-kind': 'shelf' })));
    compartment.drawers.forEach((drawer) => svg.append(node('rect', { x: X(x0) + 1.5, y: innerY(drawer.y + drawer.height) + 1, width: Math.max(w - 3, 1), height: Math.max(drawer.height * scale - 2, 1), rx: 1.5, class: 'drawer', 'data-kind': 'drawer' })));
    compartment.rails.forEach((rail) => svg.append(node('line', { x1: X(x0) + 4, x2: X(x1) - 4, y1: innerY(rail.y), y2: innerY(rail.y), class: 'rail', 'data-kind': 'rail' })));
    // Compartment width under the drawing.
    dimension(svg, { x1: X(x0), y1: Y(0) + 18, x2: X(x1), y2: Y(0) + 18, label: cm(compartment.width) });
  });

  dimension(svg, { x1: X(0), y1: oy - 14, x2: X(width), y2: oy - 14, label: cm(width) });
  dimension(svg, { x1: X(0) - 22, y1: Y(height), x2: X(0) - 22, y2: Y(0), label: cm(height), vertical: true });
  return svg;
}
