// Hover tooltip over the 3D view: a small label such as "מדף · גובה 80 ס"מ" next to the pointer.
// View feedback only: it reads the design, never selects or changes anything.
import { cm } from './format.js';

const OFFSET_PX = 12;

// One pair of strings per language; `{n}` is replaced by a number.
const TEXT = Object.freeze({
  he: { shelf: 'מדף · גובה {n} ס"מ', drawer: 'מגירה · גובה {n} ס"מ', compartment: 'תא {i} · רוחב {n} ס"מ' },
  en: { shelf: 'Shelf · height {n} cm', drawer: 'Drawer · height {n} cm', compartment: 'Compartment {i} · width {n} cm' },
});

/** Centimetres without a pointless trailing ".0": 800 mm -> "80", 643 mm -> "64.3". */
const trimmed = (mm) => String(Number(cm(mm)));

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

/**
 * The tooltip text for the component with this id, or `null` when it has none.
 * Shelves, drawers and compartments only; `language` is 'he' or 'en' (anything else falls back to English).
 */
export function hoverLabel(design, id, language = 'en') {
  if (!design || typeof id !== 'string') return null;
  const text = TEXT[language] ?? TEXT.en;
  for (const [index, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return fill(text.compartment, { i: index + 1, n: trimmed(compartment.width) });
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return fill(text.shelf, { n: trimmed(shelf.y) });
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return fill(text.drawer, { n: trimmed(drawer.height) });
  }
  return null;
}

/**
 * Where to put a tooltip of `width` x `height` for a pointer at (x, y) inside a container of the same
 * coordinate space: below and to the right of the pointer, flipped near the edges, never outside.
 */
export function placeTooltip({ x, y, width, height, container }) {
  let left = x + OFFSET_PX;
  let top = y + OFFSET_PX;
  if (left + width > container.width) left = x - OFFSET_PX - width;
  if (top + height > container.height) top = y - OFFSET_PX - height;
  return {
    left: Math.max(0, Math.min(left, container.width - width)),
    top: Math.max(0, Math.min(top, container.height - height)),
  };
}

/** The tooltip element inside the viewer. Text is set with textContent only (never HTML). */
export function createHoverTooltip({ container }) {
  const node = document.createElement('div');
  node.className = 'hover-tooltip';
  node.setAttribute('role', 'tooltip');
  node.hidden = true;
  container.append(node);
  let text = null;

  return {
    /** Show `label` for a pointer at (x, y) in the container's own coordinates. */
    show(label, x, y) {
      if (label !== text) {
        node.textContent = label;
        text = label;
      }
      node.hidden = false;
      const { left, top } = placeTooltip({
        x, y, width: node.offsetWidth, height: node.offsetHeight, container: { width: container.clientWidth, height: container.clientHeight },
      });
      node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hide() {
      node.hidden = true;
      text = null;
    },
    dispose() {
      node.remove();
    },
  };
}
