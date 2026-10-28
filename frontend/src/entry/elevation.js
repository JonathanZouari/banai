// A drawn front view of a design (doors off): partitions, shelves, drawers and rails as a simple
// SVG. It is the start-screen card's placeholder while the 3D thumbnail renders, and its fallback
// when WebGL is missing or too slow. Drawn at the same shared scale as the thumbnails, so a small
// wardrobe looks small here too. Numbers only, built with createElementNS (no markup strings).
import { compartmentXRanges, interiorHeight } from '../domain/geometry.js';
import { THUMBNAIL_REFERENCE } from '../viewer/snapshot.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 160; // mm around the reference box

function node(name, attrs) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

export function elevationSvg(design) {
  const { width, height } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const boxWidth = Math.max(width, THUMBNAIL_REFERENCE.width) + 2 * MARGIN;
  const boxHeight = Math.max(height, THUMBNAIL_REFERENCE.height) + 2 * MARGIN;
  const left = (boxWidth - width) / 2;
  const floor = boxHeight - MARGIN;
  // Design coordinates (x from the inner left face, y up from the bottom panel) to SVG coordinates.
  const x = (mm) => left + panel + mm;
  const y = (mm) => floor - panel - mm;

  const svg = node('svg', { viewBox: `0 0 ${boxWidth} ${boxHeight}`, class: 'elevation', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMax meet' });
  svg.append(
    node('line', { x1: 0, y1: floor, x2: boxWidth, y2: floor, class: 'elevation__floor' }),
    node('rect', { x: left, y: floor - height, width, height, class: 'elevation__carcass' }),
    node('rect', { x: x(0), y: y(interiorHeight(design)), width: width - 2 * panel, height: interiorHeight(design), class: 'elevation__inside' }),
  );
  const ranges = compartmentXRanges(design);
  design.partitions.forEach((_, i) => {
    const [, end] = ranges[i];
    const [start] = ranges[i + 1];
    svg.append(node('rect', { x: x(end), y: y(interiorHeight(design)), width: start - end, height: interiorHeight(design), class: 'elevation__part' }));
  });
  design.compartments.forEach((compartment, i) => {
    const [x0, x1] = ranges[i];
    compartment.shelves.forEach((s) => svg.append(node('rect', { x: x(x0), y: y(s.y + s.thickness), width: x1 - x0, height: s.thickness, class: 'elevation__part' })));
    compartment.drawers.forEach((d) => {
      svg.append(node('rect', { x: x(x0) + 8, y: y(d.y + d.height) + 4, width: x1 - x0 - 16, height: d.height - 8, rx: 6, class: 'elevation__drawer' }));
      svg.append(node('line', { x1: x((x0 + x1) / 2) - 60, x2: x((x0 + x1) / 2) + 60, y1: y(d.y + d.height / 2), y2: y(d.y + d.height / 2), class: 'elevation__handle' }));
    });
    compartment.rails.forEach((r) => svg.append(node('line', { x1: x(x0) + 20, x2: x(x1) - 20, y1: y(r.y), y2: y(r.y), class: 'elevation__rail' })));
  });
  return svg;
}
