// The room around the wardrobe (ADR-037, domain/room.js): a floor plan from a template (a rectangle, an L, a room
// with a recess), the wall the wardrobe stands against and where along it. A small plan shows the walls by
// number and the wardrobe on its wall; the 3D view builds the walls. Estimates from the customer, like the rest of
// the site: the carpenter measures again. Handlers read the design at commit time (current()): the panel's
// fields outlive their render.
import { actionResult, button, cmField, collapsibleSection, el, selectField } from './fields.js';
import { frontClearance, roomCorners, roomWalls, sideGap } from '../domain/room.js';
import { toCmText } from './opsFromForm.js';

export const ROOM_TEMPLATES = Object.freeze([
  { value: 'none', label: 'ללא חדר' },
  { value: 'rect', label: 'חדר מלבני' },
  { value: 'l', label: 'חדר בצורת L' },
  { value: 'recess', label: 'חדר עם נישה' },
]);

// Each template's fields, in the order a carpenter would measure them.
export const SHAPE_FIELDS = Object.freeze({
  rect: [['width', 'רוחב החדר'], ['depth', 'עומק החדר']],
  l: [['width', 'רוחב החדר'], ['depth', 'עומק החדר'], ['cutWidth', 'רוחב הפינה החסרה'], ['cutDepth', 'עומק הפינה החסרה']],
  recess: [['width', 'רוחב החדר'], ['depth', 'עומק החדר'], ['recessX', 'מהפינה השמאלית עד הנישה'],
    ['recessWidth', 'רוחב הנישה'], ['recessDepth', 'עומק הנישה']],
});

// A new niche leaves a filler's width each side of the wardrobe (advisory R27's 5 cm).
const NICHE_SPARE = 100;

/** A new room of `kind` around the wardrobe (mm): room to stand in front, and a niche that fits the wardrobe. */
export function newRoomShape(kind, design) {
  const { width: w, depth: d } = design.dimensions;
  if (kind === 'l') return { kind, width: Math.max(4500, w + 2100), depth: 4000, cutWidth: 1500, cutDepth: 1500 };
  if (kind === 'recess') {
    const recessWidth = w + NICHE_SPARE;
    const width = Math.max(4000, recessWidth + 1200);
    return { kind, width, depth: 3500, recessX: Math.floor((width - recessWidth) / 2), recessWidth, recessDepth: Math.max(d, 600) };
  }
  return { kind: 'rect', width: Math.max(3500, w + 1500), depth: 4000 };
}

/** set_room ops for the template `kind` ('none' removes the room); null when nothing changes. */
export function roomTemplateOps(design, kind) {
  if (kind === 'none') return design.room ? [{ op: 'set_room', clear: true }] : null;
  if (design.room?.shape.kind === kind) return null;
  return [{ op: 'set_room', shape: newRoomShape(kind, design) }];
}

/** set_room ops for one size of the current room, keeping the wall and the place along it. */
export const roomSizeOps = (design, field, mm) => (design.room
  ? [{ op: 'set_room', shape: { ...design.room.shape, [field]: mm }, wall: design.room.wall, offset: design.room.offset }]
  : null);

const PLAN = Object.freeze({ width: 260, height: 180, pad: 18 });
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
};

/** The floor plan from above: every wall with its number, the wardrobe's wall marked, the wardrobe on it. */
export function roomPlan(design, onPickWall = null) {
  const { shape, wall: chosen, offset } = design.room;
  const corners = roomCorners(shape);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const scale = Math.min((PLAN.width - 2 * PLAN.pad) / (Math.max(...xs) - minX), (PLAN.height - 2 * PLAN.pad) / (Math.max(...ys) - minY));
  const at = ([x, y]) => [PLAN.pad + (x - minX) * scale, PLAN.pad + (y - minY) * scale];
  const plan = svg('svg', { viewBox: `0 0 ${PLAN.width} ${PLAN.height}`, class: 'room-plan', role: 'img', 'aria-label': 'תוכנית החדר מלמעלה' });
  plan.dataset.testid = 'room-plan';
  plan.append(svg('polygon', { points: corners.map((p) => at(p).join(',')).join(' '), class: 'room-plan__floor' }));
  roomWalls(shape).forEach(({ start, end, length }, i) => {
    const [a, b] = [at(start), at(end)];
    const line = svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `room-plan__wall${i === chosen ? ' room-plan__wall--chosen' : ''}` });
    // The number sits just inside the wall, in its middle.
    const [ux, uy] = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    const label = svg('text', { x: (a[0] + b[0]) / 2 - uy * 11, y: (a[1] + b[1]) / 2 + ux * 11 + 4, class: 'room-plan__label' });
    label.textContent = String(i + 1);
    const item = svg('g', { class: 'room-plan__item' });
    item.dataset.wall = String(i);
    const title = svg('title');
    title.textContent = `קיר ${i + 1} · ${toCmText(length)} ס״מ`;
    const hit = svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'room-plan__hit' }); // a wider target
    item.append(title, hit, line, label);
    if (onPickWall) item.addEventListener('click', () => onPickWall(i));
    plan.append(item);
  });
  // The wardrobe: from its left face along the wall, as deep as the carcass, into the room.
  const { start, end, length } = roomWalls(shape)[chosen];
  const [ux, uy] = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const [nx, ny] = [-uy, ux];
  const { width: w, depth: d } = design.dimensions;
  const p = (along, into) => at([start[0] + ux * along + nx * into, start[1] + uy * along + ny * into]);
  const box = [p(offset, 0), p(offset + w, 0), p(offset + w, d), p(offset, d)];
  plan.append(svg('polygon', { points: box.map((q) => q.join(',')).join(' '), class: 'room-plan__wardrobe' }));
  return plan;
}

/** The space the plan leaves around the wardrobe, in words. */
function spaceNote(design) {
  const cmText = (mm) => (mm === null ? '—' : `${toCmText(mm)} ס״מ`);
  return `מול הארון ${cmText(frontClearance(design))} · משמאל ${cmText(sideGap(design, 'left'))} · מימין ${cmText(sideGap(design, 'right'))} עד הקיר.`;
}

export function roomSection({ design, run, current = () => design }) {
  const section = collapsibleSection('room', 'החדר', [
    el('p', { className: 'panel__note', text: 'תוכנית החדר והקיר שעליו עומד הארון. מספרי הקירות בתוכנית; כשעומדים בחדר מול הקיר, המרחק נמדד מקצהו השמאלי. אפשר גם לתאר את החדר לבוב.' }),
  ]);
  section.dataset.testid = 'room-section';
  const kind = selectField({
    label: 'צורת החדר', options: ROOM_TEMPLATES, value: design.room?.shape.kind ?? 'none', testId: 'room-kind',
    onChange: (value) => {
      const ops = roomTemplateOps(current(), value);
      return actionResult(section, ops ? run(ops) : { ok: true });
    },
  });
  section.append(kind);
  const { room } = design;
  if (!room) return section;

  const sizes = SHAPE_FIELDS[room.shape.kind].map(([field, label]) => cmField({
    label, testId: `room-${field}`, mm: room.shape[field],
    onCommit: (mm) => (mm === null ? { ok: true } : run(roomSizeOps(current(), field, mm))),
  }));
  section.append(el('div', { className: 'room-sizes' }, sizes));
  const pickWall = (index) => actionResult(section, run([{ op: 'set_room', wall: index }]));
  section.append(roomPlan(design, pickWall));
  section.append(selectField({
    label: 'הארון עומד על', testId: 'room-wall', value: String(room.wall),
    options: roomWalls(room.shape).map((w, i) => ({ value: String(i), label: `קיר ${i + 1} · ${toCmText(w.length)} ס״מ` })),
    onChange: (value) => pickWall(Number(value)),
  }));
  section.append(cmField({
    label: 'מהקצה השמאלי של הקיר', testId: 'room-offset', mm: room.offset,
    onCommit: (mm) => (mm === null ? { ok: true } : run([{ op: 'set_room', offset: mm }])),
  }));
  section.append(button('מרכז על הקיר', () => actionResult(section, run([{ op: 'set_room', wall: current().room.wall }])), {
    variant: 'secondary', testId: 'room-centre',
  }));
  section.append(el('p', { className: 'panel__note', text: spaceNote(design), attrs: { 'data-testid': 'room-space' } }));
  return section;
}
