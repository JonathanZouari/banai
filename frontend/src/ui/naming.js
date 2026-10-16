// Customer-facing names for components. Internal domain terms (compartment, partition,
// carcass, op) stay in the code; the UI says section, divider, wardrobe body, change.
// Internal ids are never shown to the user.
import { cm } from '../viewer/format.js';

const ITEM_LISTS = Object.freeze({ shelf: 'shelves', drawer: 'drawers', rail: 'rails' });
const ITEM_NOUNS = Object.freeze({ shelf: 'Shelf', drawer: 'Drawer', rail: 'Hanging rail' });

export const KIND_NOUNS = Object.freeze({
  carcass: 'Wardrobe body', compartment: 'Section', partition: 'Divider', door: 'Door', ...ITEM_NOUNS,
});

/** "Left section", "Middle section", "Right section", or "Section 4" for wider layouts. */
export function sectionName(design, index) {
  const count = design.compartments.length;
  if (count === 1) return 'Section';
  if (count <= 3) {
    const names = count === 2 ? ['Left', 'Right'] : ['Left', 'Middle', 'Right'];
    return `${names[index]} section`;
  }
  return `Section ${index + 1}`;
}

/** Short upper-case section label for the structure strip ("LEFT", "MIDDLE", "S4"). */
export function sectionTag(design, index) {
  const name = sectionName(design, index);
  return name === 'Section' ? 'SECTION' : name.replace(' section', '').replace('Section ', 'S').toUpperCase();
}

/** Items of one kind in a section, ordered bottom → top (the numbering customers see). */
function orderedItems(compartment, kind) {
  return [...compartment[ITEM_LISTS[kind]]].sort((a, b) => a.y - b.y);
}

/**
 * Human-readable name of a component: { title, parent } — e.g. { title: 'Shelf 2',
 * parent: 'Left section' }. Returns null when the id is not in the design.
 */
export function nameOf(design, id) {
  if (id === 'carcass') return { title: 'Wardrobe body', parent: null, kind: 'carcass' };
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return { title: sectionName(design, ci), parent: null, kind: 'compartment' };
    for (const kind of Object.keys(ITEM_LISTS)) {
      const items = orderedItems(compartment, kind);
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) {
        const title = items.length === 1 ? ITEM_NOUNS[kind] : `${ITEM_NOUNS[kind]} ${index + 1}`;
        return { title, parent: sectionName(design, ci), kind };
      }
    }
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return { title: design.partitions.length === 1 ? 'Divider' : `Divider ${pi + 1}`, parent: null, kind: 'partition' };
  const di = design.doors.items.findIndex((d) => d.id === id);
  if (di >= 0) {
    const noun = design.doors.type === 'sliding' ? 'Sliding door' : 'Door';
    return { title: design.doors.items.length === 1 ? noun : `${noun} ${di + 1}`, parent: null, kind: 'door' };
  }
  return null;
}

/** "Shelf 2 · Left section" (or just "Left section"). */
export function labelOf(design, id) {
  const name = nameOf(design, id);
  if (!name) return '';
  return name.parent ? `${name.title} · ${name.parent}` : name.title;
}

/** Short tag for the selected component in the 3D view, e.g. "Shelf 2 · 80.0 cm from base". */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const name = nameOf(design, id);
  if (!name) return '';
  if (kind === 'carcass') {
    const { width, height, depth } = design.dimensions;
    return `Wardrobe · ${cm(width)} × ${cm(height)} × ${cm(depth)} cm`;
  }
  if (kind === 'compartment') {
    return `${name.title} · ${cm(design.compartments.find((c) => c.id === id).width)} cm wide`;
  }
  for (const compartment of design.compartments) {
    const item = [...compartment.shelves, ...compartment.drawers, ...compartment.rails].find((i) => i.id === id);
    if (!item) continue;
    if (kind === 'drawer') return `${name.title} · ${cm(item.height)} cm high`;
    return `${name.title} · ${cm(item.y)} cm from base`;
  }
  return name.title;
}

const sectionOf = (design, compartmentId) => {
  const index = design.compartments.findIndex((c) => c.id === compartmentId);
  return index >= 0 ? sectionName(design, index) : 'a section';
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * One customer-facing line per change, described against the design BEFORE the change.
 * Used for proposal cards when the agent does not supply its own summary.
 */
export function describeOps(design, ops) {
  const lines = []; // strings, or { kind, section, count } records for grouped additions
  const adds = new Map(); // groups "Add 2 shelves to Left section"
  ops.forEach((op) => {
    switch (op.op) {
      case 'create_wardrobe':
        lines.push(`New wardrobe ${cm(op.width)} × ${cm(op.height)} × ${cm(op.depth)} cm, ${plural(op.compartmentCount, 'section')}`);
        break;
      case 'update_dimensions': {
        const parts = ['width', 'height', 'depth']
          .filter((field) => op[field] !== undefined && op[field] !== null)
          .map((field) => `${field[0].toUpperCase()}${field.slice(1)} ${cm(design.dimensions[field])} → ${cm(op[field])} cm`);
        lines.push(parts.join(', ') || 'Update dimensions');
        break;
      }
      case 'configure_doors':
        lines.push(op.type === 'none' ? 'Remove the doors' : `${op.type === 'sliding' ? 'Sliding' : 'Hinged'} doors`);
        break;
      case 'add_compartment':
        lines.push(`Add a section (${cm(op.width)} cm)`);
        break;
      case 'modify_compartment': {
        const compartment = design.compartments.find((c) => c.id === op.compartmentId);
        lines.push(`${sectionOf(design, op.compartmentId)}: ${compartment ? `${cm(compartment.width)} → ` : ''}${cm(op.width)} cm`);
        break;
      }
      case 'add_partition':
        lines.push(`Split ${sectionOf(design, op.compartmentId)} with a divider`);
        break;
      case 'modify_partition':
        lines.push(`Move ${labelOf(design, op.partitionId) || 'a divider'}`);
        break;
      case 'add_shelf':
      case 'add_drawer':
      case 'add_rail': {
        const kind = op.op.slice(4);
        const key = `${kind}:${op.compartmentId}`;
        if (adds.has(key)) adds.get(key).count += 1;
        else {
          const record = { kind, section: sectionOf(design, op.compartmentId), count: 1 };
          adds.set(key, record);
          lines.push(record);
        }
        break;
      }
      case 'modify_shelf':
      case 'modify_drawer':
      case 'modify_rail': {
        const label = labelOf(design, op.id) || 'an item';
        lines.push(op.y !== undefined && op.y !== null ? `Move ${label} to ${cm(op.y)} cm` : `Resize ${label}`);
        break;
      }
      case 'set_material': {
        const target = op.target === 'carcass' ? 'the wardrobe body' : op.target === 'doors' ? 'all doors' : labelOf(design, op.target) || 'an item';
        lines.push(op.material?.catalogId === 'mirror' ? `Mirror front on ${target}` : `New finish for ${target}`);
        break;
      }
      case 'remove_component':
        lines.push(`Remove ${labelOf(design, op.id) || 'a component'}`);
        break;
      default:
        lines.push('Other change');
    }
  });
  return lines.map((line) => {
    if (typeof line === 'string') return line;
    const noun = ITEM_NOUNS[line.kind].toLowerCase();
    const what = line.count === 1 ? `a ${noun}` : `${line.count} ${PLURALS[line.kind]}`;
    return `Add ${what} to ${line.section}`;
  });
}

const PLURALS = Object.freeze({ shelf: 'shelves', drawer: 'drawers', rail: 'hanging rails' });
