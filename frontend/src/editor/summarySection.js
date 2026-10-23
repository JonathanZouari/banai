// Design summary: interior and exterior dimensions in one view window, switched by a slider.
// The slider is a two-tab tablist (arrow keys move between tabs); the hidden view is inert.
// Switching is done in place, so the slide animation plays; the choice is kept in store.ui
// so a re-render after a design change opens the same view. Figures only: no prices, and
// no claim that the design can be manufactured.
import { componentCounts, exteriorSummary, interiorSummary } from '../domain/geometry.js';
import { el, nextId, section } from './fields.js';
import { toCmText } from './opsFromForm.js';

const VIEWS = Object.freeze([
  { id: 'interior', label: 'Interior', title: 'Interior dimensions' },
  { id: 'exterior', label: 'Exterior', title: 'Exterior dimensions' },
]);
const DOOR_TYPES = Object.freeze({ hinged: 'Hinged', sliding: 'Sliding', none: 'None' });

const cm = (mm) => `${toCmText(mm)} cm`;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const countsText = ({ compartments, shelves, drawers, rails }) => [
  plural(compartments, 'compartment', 'compartments'),
  plural(shelves, 'shelf', 'shelves'),
  plural(drawers, 'drawer', 'drawers'),
  plural(rails, 'rail', 'rails'),
].join(' · ');

function rows(entries) {
  return el('dl', { className: 'summary-list' }, entries.map(([label, value, testId]) => el('div', { className: 'summary-list__row' }, [
    el('dt', { text: label }),
    el('dd', { text: value, attrs: testId ? { 'data-testid': testId } : {} }),
  ])));
}

function interiorRows(design) {
  const s = interiorSummary(design);
  return rows([
    ['Interior width', cm(s.width), 'summary-interior-width'],
    ['Interior height', cm(s.height), 'summary-interior-height'],
    ['Interior depth', cm(s.depth), 'summary-interior-depth'],
    ['Compartment widths', `${s.compartmentWidths.map(toCmText).join(' · ')} cm`, 'summary-compartment-widths'],
    ['Interior volume (gross)', `≈ ${Math.round(s.volumeLitres).toLocaleString('en-US')} L`, 'summary-volume'],
    ['Hanging length', s.hangingLengthMm ? cm(s.hangingLengthMm) : 'No rails', 'summary-hanging'],
  ]);
}

function exteriorRows(design) {
  const s = exteriorSummary(design);
  return rows([
    ['Width', cm(s.width), 'summary-exterior-width'],
    ['Height', cm(s.height), 'summary-exterior-height'],
    ['Depth', cm(s.depth), 'summary-exterior-depth'],
    ['Panel thickness', cm(s.panelThickness), 'summary-panel-thickness'],
    ['Footprint', `${s.footprintM2.toFixed(2)} m²`, 'summary-footprint'],
    ['Doors', s.doorCount ? `${s.doorCount} · ${DOOR_TYPES[s.doorType]}` : 'None', 'summary-doors'],
  ]);
}

export function summarySection({ design, summaryView, setSummaryView }) {
  const container = section('Design summary', []);
  container.dataset.testid = 'summary-section';
  const track = el('div', { className: 'summary-track' });
  const tabs = [];
  const panels = [];

  const reflect = (view) => {
    track.dataset.view = view;
    VIEWS.forEach(({ id }, index) => {
      const active = id === view;
      tabs[index].setAttribute('aria-selected', String(active));
      tabs[index].tabIndex = active ? 0 : -1;
      panels[index].toggleAttribute('inert', !active);
      panels[index].setAttribute('aria-hidden', String(!active));
    });
  };
  const show = (view, { focus = false } = {}) => {
    reflect(view);
    if (focus) tabs[VIEWS.findIndex(({ id }) => id === view)].focus();
    setSummaryView(view);
  };

  VIEWS.forEach(({ id, label, title }) => {
    const tabId = nextId('summary-tab');
    const panelId = nextId('summary-panel');
    const tab = el('button', {
      className: 'summary-switch__tab',
      text: label,
      attrs: { type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'data-testid': `summary-tab-${id}` },
    });
    tab.addEventListener('click', () => show(id));
    tabs.push(tab);
    panels.push(el('div', {
      className: 'summary-panel',
      attrs: { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, 'data-testid': `summary-panel-${id}` },
    }, [el('h4', { className: 'summary-panel__title', text: title }), id === 'interior' ? interiorRows(design) : exteriorRows(design)]));
  });

  const tablist = el('div', { className: 'summary-switch', attrs: { role: 'tablist', 'aria-label': 'Dimensions view' } }, [
    el('span', { className: 'summary-switch__thumb', attrs: { 'aria-hidden': 'true' } }),
    ...tabs,
  ]);
  tablist.addEventListener('keydown', (event) => {
    const current = VIEWS.findIndex(({ id }) => id === track.dataset.view);
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: VIEWS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    show(VIEWS[(next + VIEWS.length) % VIEWS.length].id, { focus: true });
  });

  track.append(...panels);
  reflect(summaryView); // no store commit while rendering
  container.append(
    tablist,
    el('div', { className: 'summary-viewport' }, [track]),
    el('p', { className: 'summary-counts', text: countsText(componentCounts(design)), attrs: { 'data-testid': 'summary-counts' } }),
    el('p', { className: 'panel__note', text: 'Calculated from the design as drawn. Not a price and not a manufacturing check.' }),
  );
  return container;
}
