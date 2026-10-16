// Wardrobe structure bar under the 3D view: one card per section (a tiny drawing of its
// contents, name and width), divider ticks between them, and "+ Add section". Clicking
// a card or divider selects it in the same global selection the 3D view, inspector and
// assistant use. Follows the proposal preview while one is shown.
import { el } from '../editor/fields.js';
import { addCompartmentOps } from '../editor/opsFromForm.js';
import { interiorHeight } from '../domain/geometry.js';
import { cm } from '../viewer/format.js';
import { labelOf, sectionName } from './naming.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MINI = Object.freeze({ w: 34, h: 46, pad: 3 });

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

/** A small schematic of one section: shelves as lines, drawers as boxes, rails as rods. */
function miniature(design, compartment) {
  const { w, h, pad } = MINI;
  const svg = svgNode('svg', { class: 'mini', viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
  svg.append(svgNode('rect', { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: 3, fill: '#e1d8cb', stroke: '#d2c6b6' }));
  const top = interiorHeight(design) || 1;
  const yOf = (mm) => h - pad - ((h - 2 * pad) * mm) / top;
  compartment.drawers.forEach((drawer) => {
    const y1 = yOf(drawer.y + drawer.height);
    svg.append(svgNode('rect', { x: pad + 1, y: y1 + 0.5, width: w - 2 * pad - 2, height: Math.max(1.5, yOf(drawer.y) - y1 - 1), rx: 1, fill: '#eee5d8', stroke: '#bcae9a', 'stroke-width': 0.8 }));
  });
  compartment.shelves.forEach((shelf) => {
    const y = yOf(shelf.y);
    svg.append(svgNode('line', { x1: pad, x2: w - pad, y1: y, y2: y, stroke: '#b89f7d', 'stroke-width': 1.6 }));
  });
  compartment.rails.forEach((rail) => {
    const y = yOf(rail.y);
    svg.append(svgNode('line', { x1: pad + 3, x2: w - pad - 3, y1: y, y2: y, stroke: '#8b8175', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  });
  return svg;
}

function activeSectionId(design, selection) {
  if (!selection) return null;
  const owner = design.compartments.find((c) => c.id === selection.id
    || [...c.shelves, ...c.drawers, ...c.rails].some((item) => item.id === selection.id));
  return owner?.id ?? null;
}

export function mountStructureNav(root, store) {
  let rendered = { design: null, selection: undefined };

  const render = (state) => {
    const proposal = state.proposal && !state.proposal.stale ? state.proposal : null;
    const design = proposal ? proposal.previewDesign : state.design;
    if (design === rendered.design && state.selection === rendered.selection) return;
    rendered = { design, selection: state.selection };
    const active = activeSectionId(design, state.selection);
    const strip = el('div', { className: 'structure__strip' });
    design.compartments.forEach((compartment, index) => {
      const isActive = compartment.id === active;
      const card = el('button', {
        className: `structure-card${isActive ? ' is-active' : ''}`,
        attrs: { type: 'button', 'data-testid': `nav-${index}`, 'aria-pressed': String(isActive), 'aria-label': `${labelOf(design, compartment.id)}, ${cm(compartment.width)} cm` },
      }, [
        miniature(design, compartment),
        el('span', { className: 'structure-card__text' }, [
          el('b', { text: sectionName(design, index) }),
          el('span', { text: `${cm(compartment.width)} cm` }),
        ]),
      ]);
      card.addEventListener('click', () => store.select(compartment.id));
      strip.append(card);
      const partition = design.partitions[index];
      if (partition) {
        const divider = el('button', {
          className: `structure__divider${state.selection?.id === partition.id ? ' is-active' : ''}`,
          attrs: { type: 'button', 'aria-label': labelOf(design, partition.id), title: labelOf(design, partition.id) },
        });
        divider.addEventListener('click', () => store.select(partition.id));
        strip.append(divider);
      }
    });
    const add = el('button', { className: 'structure-card structure-card--add', text: '+ Add section', attrs: { type: 'button', 'data-testid': 'nav-add' } });
    add.disabled = Boolean(proposal); // the strip shows a preview: edit after deciding on it
    add.addEventListener('click', () => {
      const { design: committed } = store.getState();
      const result = store.dispatch(addCompartmentOps(committed));
      if (result.ok) store.select(store.getState().design.compartments.at(-1).id);
    });
    strip.append(add);
    root.replaceChildren(
      el('div', { className: 'structure__header' }, [
        el('span', { className: 'structure__title', text: 'Wardrobe structure' }),
        el('span', { className: 'structure__total', text: `Total ${cm(design.dimensions.width)} cm` }),
      ]),
      strip,
    );
  };

  store.subscribe(render);
  render(store.getState());
}
