// Drawing geometry for the PDF: front elevations and a plan view as plain shapes in millimetres.
// Pure data (no jsPDF, no DOM). x runs left to right from the outer left face; in elevations y runs up
// from the floor, in the plan y runs from the front face towards the back (the front is at the bottom).
// Door gaps, handle and back-panel sizes reuse the viewer's illustrative VISUAL values (not specifications).
import { compartmentXRanges, interiorHeight, interiorWidth } from '../domain/geometry.js';
import { HANDLE_LENGTH, handleInset } from '../viewer/builders/doors.js';
import { VISUAL } from '../viewer/units.js';

/** Standard drawing scales (1:n), largest drawing first. */
export const SCALES = Object.freeze([5, 10, 20, 25, 50, 100, 200]);

/** The largest standard scale at which a `widthMm` x `heightMm` drawing fits `availW` x `availH` paper millimetres. */
export function pickScale(widthMm, heightMm, availW, availH) {
  return SCALES.find((n) => widthMm / n <= availW && heightMm / n <= availH) ?? SCALES.at(-1);
}

const rect = (role, x, y, w, h, extra = {}) => ({ type: 'rect', role, x, y, w, h, ...extra });
const line = (role, x1, y1, x2, y2) => ({ type: 'line', role, x1, y1, x2, y2 });

/** Diagonal hatch lines inside a rectangle, clipped to it. */
export function hatch(x, y, w, h, spacing) {
  const lines = [];
  for (let c = -h; c < w; c += spacing) {
    const x0 = Math.max(0, c);
    const x1 = Math.min(w, h + c);
    if (x1 - x0 > 0.5) lines.push(line('mirror', x + x0, y + x0 - c, x + x1, y + x1 - c));
  }
  return lines;
}

/** Centre height of a handle's grip on a door panel (same rule as the 3D view). */
function gripY(panelY, panelHeight, length) {
  const halfSpan = Math.max(0, panelHeight / 2 - length / 2 - 20);
  return Math.min(Math.max(VISUAL.handleHeightFromFloor, panelY - halfSpan), panelY + halfSpan);
}

function handleShape(style, x, panelY, panelHeight) {
  if (style === 'none') return null;
  if (style === 'knob') {
    const size = 2 * VISUAL.knobRadius;
    return rect('handle', x - size / 2, gripY(panelY, panelHeight, size) - size / 2, size, size, { style });
  }
  const [maxLength, share] = HANDLE_LENGTH[style] ?? HANDLE_LENGTH.bar;
  const length = Math.min(maxLength, panelHeight * share);
  const width = style === 'edge_pull' ? VISUAL.edgePullWidth : VISUAL.handleWidth;
  return rect('handle', x - width / 2, gripY(panelY, panelHeight, length) - length / 2, width, length, { style });
}

function doorShapes(design, ranges, { hatchMm }) {
  const { doors } = design;
  if (doors.type === 'none' || doors.items.length === 0) return [];
  const panel = design.carcass.panelThickness;
  const innerHeight = interiorHeight(design);
  const gap = VISUAL.doorGap;
  const y0 = panel + gap;
  const panelHeight = innerHeight - 2 * gap;
  const panelY = panel + innerHeight / 2;
  const style = doors.handles.style;
  const shapes = [];
  const addDoor = (door, x, w, handleX) => {
    shapes.push(rect('door', x, y0, w, panelHeight, { doorId: door.id }));
    if (door.front === 'mirror') {
      const inset = VISUAL.mirrorInset;
      shapes.push(...hatch(x + inset, y0 + inset, w - 2 * inset, panelHeight - 2 * inset, hatchMm));
    }
    const handle = handleShape(style, handleX, panelY, panelHeight);
    if (handle) shapes.push(handle);
  };

  if (doors.type === 'hinged') {
    const rangeOf = new Map(design.compartments.map((c, i) => [c.id, [panel + compartmentXRanges(design)[i][0], panel + compartmentXRanges(design)[i][1]]]));
    doors.items.forEach((door) => {
      const x0 = rangeOf.get(door.compartmentIds[0])[0];
      const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
      const left = x0 + gap;
      const right = x1 - gap;
      const inset = handleInset(style);
      const handleX = door.hingeSide === 'right' ? left + inset : right - inset;
      addDoor(door, left, right - left, handleX);
      if (door.hingeSide) {
        // The dashed triangle's point is on the hinge side.
        const freeX = door.hingeSide === 'left' ? right : left;
        const hingeX = door.hingeSide === 'left' ? left : right;
        const midY = y0 + panelHeight / 2;
        shapes.push(
          { ...line('hinge', freeX, y0, hingeX, midY), dashed: true },
          { ...line('hinge', freeX, y0 + panelHeight, hingeX, midY), dashed: true },
        );
      }
    });
    return shapes;
  }

  // Sliding: panels overlap and alternate between a back and a front track. Back-track panels are drawn
  // first so the front ones cover them.
  const count = doors.items.length;
  const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
  const innerWidth = interiorWidth(design);
  const panelWidth = (innerWidth + (count - 1) * overlap) / count;
  const step = panelWidth - overlap;
  const inset = handleInset(style);
  const order = [...doors.items.keys()].sort((a, b) => (a % 2) - (b % 2) || a - b);
  order.forEach((i) => {
    const door = doors.items[i];
    const x = panel + i * step;
    const onFront = i % 2 === 1;
    const isLast = i === count - 1;
    let handleX;
    if (count === 1) handleX = x + panelWidth - inset;
    else if (isLast) handleX = x + (onFront ? 0 : overlap) + inset;
    else handleX = x + panelWidth - (onFront ? 0 : overlap) - inset;
    addDoor(door, x, panelWidth, handleX);
  });
  return shapes;
}

/**
 * Front elevation. mode 'closed' draws the doors over the carcass, 'interior' shows what is inside.
 * Returns { shapes, tags, dims, width, height }. A tag is a height label (value in mm) for an interior item.
 */
export function frontElevation(design, mode, { hatchMm = 120 } = {}) {
  const { width, height } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerWidth = interiorWidth(design);
  const innerHeight = interiorHeight(design);
  const ranges = compartmentXRanges(design).map(([a, b]) => [panel + a, panel + b]);
  const shapes = [rect('outline', 0, 0, width, height), rect('inner', panel, panel, innerWidth, innerHeight)];
  const tags = [];

  design.partitions.forEach((partition, i) => {
    shapes.push(rect('partition', ranges[i][1], panel, partition.thickness, innerHeight));
  });
  if (mode === 'interior') {
    design.compartments.forEach((compartment, ci) => {
      const [x0, x1] = ranges[ci];
      compartment.shelves.forEach((shelf) => {
        shapes.push(rect('shelf', x0, panel + shelf.y, x1 - x0, shelf.thickness));
        tags.push({ x: x0, y: panel + shelf.y + shelf.thickness, mm: shelf.y });
      });
      compartment.drawers.forEach((drawer) => {
        const drawerWidth = x1 - x0 - 2 * VISUAL.drawerGap;
        shapes.push(rect('drawer', x0 + VISUAL.drawerGap, panel + drawer.y + VISUAL.drawerGap, drawerWidth, drawer.height - 2 * VISUAL.drawerGap));
        shapes.push(line('drawerPull', (x0 + x1) / 2 - 60, panel + drawer.y + drawer.height - 40, (x0 + x1) / 2 + 60, panel + drawer.y + drawer.height - 40));
        tags.push({ x: x0, y: panel + drawer.y + drawer.height, mm: drawer.y + drawer.height });
      });
      compartment.rails.forEach((rail) => {
        shapes.push(line('rail', x0, panel + rail.y, x1, panel + rail.y));
        tags.push({ x: x0, y: panel + rail.y, mm: rail.y });
      });
    });
  } else {
    shapes.push(...doorShapes(design, ranges, { hatchMm }));
  }

  // Dimension chains: level 1 sits next to the drawing, level 2 (overall) outside it.
  const dims = [{ axis: 'x', from: 0, to: width, level: 2, mm: width }, { axis: 'y', from: 0, to: height, level: 2, mm: height }];
  const bottom = [];
  if (mode === 'interior') {
    let x = 0;
    bottom.push([x, panel]);
    x = panel;
    design.compartments.forEach((compartment, i) => {
      bottom.push([x, x + compartment.width]);
      x += compartment.width;
      if (i < design.partitions.length) {
        bottom.push([x, x + design.partitions[i].thickness]);
        x += design.partitions[i].thickness;
      }
    });
    bottom.push([x, width]);
  } else if (design.doors.type === 'hinged') {
    design.doors.items.forEach((door) => {
      const first = design.compartments.findIndex((c) => c.id === door.compartmentIds[0]);
      const last = design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1));
      bottom.push([ranges[first][0], ranges[last][1]]);
    });
  }
  if (bottom.length > 1) bottom.forEach(([from, to]) => dims.push({ axis: 'x', from, to, level: 1, mm: to - from }));
  dims.push({ axis: 'y', from: panel, to: height - panel, level: 1, mm: innerHeight });

  return { shapes, tags, dims, width, height };
}

/** Plan view (looking down). The front is at the bottom of the drawing. */
export function planView(design) {
  const { width, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerDepth = depth - VISUAL.backThickness;
  const ranges = compartmentXRanges(design).map(([a, b]) => [panel + a, panel + b]);
  const shapes = [rect('outline', 0, 0, width, depth), rect('inner', panel, 0, width - 2 * panel, innerDepth)];
  design.partitions.forEach((partition, i) => shapes.push(rect('partition', ranges[i][1], 0, partition.thickness, innerDepth)));

  const { doors } = design;
  const t = VISUAL.doorThickness;
  if (doors.type === 'hinged') {
    doors.items.forEach((door) => {
      const first = design.compartments.findIndex((c) => c.id === door.compartmentIds[0]);
      const last = design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1));
      shapes.push(rect('door', ranges[first][0] + VISUAL.doorGap, -t, ranges[last][1] - ranges[first][0] - 2 * VISUAL.doorGap, t));
    });
  } else if (doors.type === 'sliding' && doors.items.length > 0) {
    const count = doors.items.length;
    const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
    const panelWidth = (interiorWidth(design) + (count - 1) * overlap) / count;
    const step = panelWidth - overlap;
    doors.items.forEach((door, i) => {
      const row = i % 2;
      shapes.push(rect('door', panel + i * step, -t * (row + 1) - row * VISUAL.slidingTrackGap, panelWidth, t));
    });
  }
  const dims = [
    { axis: 'x', from: 0, to: width, level: 1, mm: width },
    { axis: 'y', from: 0, to: depth, level: 1, mm: depth },
  ];
  return { shapes, tags: [], dims, width, height: depth, minY: doors.type === 'none' ? 0 : -(doors.type === 'sliding' ? 2 * t + VISUAL.slidingTrackGap : t) };
}
