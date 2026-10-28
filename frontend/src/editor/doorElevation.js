// A small to-scale front view of one hinged door with its inside shelves, for the door panel.
// The model is pure (unit-tested); the SVG is built with createElementNS and textContent only.
import { DOOR_SHELF_THICKNESS } from '../domain/defaults.js';
import { compartmentXRanges, interiorHeight } from '../domain/geometry.js';
import { nextDoorShelfGap, toCmText } from './opsFromForm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_HEIGHT = 160; // px; the width follows the door's proportions
const MIN_BAR = 3; // px, so a 12 mm shelf stays visible and clickable

/** Door size and shelf bars in px, top-left origin. `next` is the gap "+ Door shelf" fills. */
export function elevationModel(design, door) {
  const ranges = compartmentXRanges(design);
  const index = (id) => design.compartments.findIndex((c) => c.id === id);
  const widthMm = ranges[index(door.compartmentIds.at(-1))][1] - ranges[index(door.compartmentIds[0])][0];
  const heightMm = interiorHeight(design);
  const k = VIEW_HEIGHT / heightMm;
  const yOf = (mm) => VIEW_HEIGHT - mm * k; // the design's y runs up from the base
  const bar = (y) => ({ top: yOf(y + DOOR_SHELF_THICKNESS), height: Math.max(MIN_BAR, DOOR_SHELF_THICKNESS * k) });
  const shelves = [...door.shelves]
    .sort((a, b) => a.y - b.y)
    .map((shelf, i) => ({ id: shelf.id, number: i + 1, y: shelf.y, depth: shelf.depth, ...bar(shelf.y) }));
  const gap = nextDoorShelfGap(design, door);
  return {
    width: Math.max(24, Math.round(widthMm * k)),
    height: VIEW_HEIGHT,
    shelves,
    next: gap && { top: yOf(gap[1]), height: (gap[1] - gap[0]) * k },
  };
}

function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

/** Clickable SVG: each shelf bar selects that shelf (Enter/Space too). */
export function doorElevation({ design, door, selectedId, select, onHover }) {
  const model = elevationModel(design, door);
  const root = svg('svg', {
    class: 'door-elevation', viewBox: `-2 -2 ${model.width + 4} ${model.height + 4}`,
    width: model.width + 4, height: model.height + 4, role: 'group', 'aria-label': 'Door front with its inside shelves',
  });
  root.append(svg('rect', { class: 'door-elevation__door', x: 0, y: 0, width: model.width, height: model.height, rx: 3 }));
  if (model.next) {
    root.append(svg('rect', {
      class: 'door-elevation__next', x: 4, y: model.next.top + 2, width: model.width - 8,
      height: Math.max(0, model.next.height - 4), rx: 2, 'aria-hidden': 'true',
    }));
  }
  for (const shelf of model.shelves) {
    const bar = svg('rect', {
      class: `door-elevation__shelf${shelf.id === selectedId ? ' is-selected' : ''}`,
      x: 3, y: shelf.top, width: model.width - 6, height: shelf.height, rx: 1,
      tabindex: 0, role: 'button', 'data-testid': `elevation-${shelf.id}`,
    });
    const title = svg('title', {});
    title.textContent = `Shelf ${shelf.number} · ${toCmText(shelf.y)} cm`;
    bar.append(title);
    bar.setAttribute('aria-label', title.textContent);
    bar.addEventListener('click', () => select(shelf.id));
    bar.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(shelf.id);
      }
    });
    if (onHover) {
      bar.addEventListener('pointerenter', () => onHover(shelf.id));
      bar.addEventListener('pointerleave', () => onHover(null));
    }
    root.append(bar);
  }
  return root;
}
