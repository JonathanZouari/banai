// Turns one diff change (domain/diff.js) into card text: a short label, before/after values with the
// unit shown once (after the new value), a detail line, and a full sentence for screen readers
// with both units ("Width changes from 200 cm to 240 cm"). Pure: no DOM.
import { SECTIONS } from '../domain/catalog.js';
import { cm } from '../viewer/format.js';
import { CATALOG_NAMES_HE, diffStringsFor } from './diffStrings.js';

const LENGTHS = new Set(['width', 'height', 'depth', 'compartmentWidth', 'shelfThickness', 'drawerHeight', 'partitionThickness']);
const ITEM_PROP = Object.freeze({ shelfThickness: 'thickness', drawerHeight: 'height' });

/** Centimetres for the card only: "200", "64.3" (the app's cm() keeps its one decimal elsewhere). */
export const cmShort = (mm) => cm(mm).replace(/\.0$/, '');

/** A catalog or custom value by name, in the card's language. */
export function refName(ref, field, language, catalog) {
  const s = diffStringsFor(language);
  if (ref?.custom) return `${s.custom}: ${ref.name}`;
  const id = ref?.catalogId;
  const entry = catalog?.[SECTIONS[field]]?.find((e) => e.id === id);
  return (language === 'he' && CATALOG_NAMES_HE[id]) || entry?.name || id || '';
}

export function groupLabel(group, language) {
  const s = diffStringsFor(language);
  return group.kind === 'compartment' ? s.group.compartment(group.index) : s.group[group.kind];
}

// Heights of added/removed/moved parts: 0 reads "at the bottom".
function heights(values, s) {
  const numbers = values.filter((y) => y !== 0).map(cmShort);
  const bottom = values.includes(0) ? [s.bottom] : [];
  return {
    detail: [...bottom, ...(numbers.length ? [s.at(`${numbers.join(' · ')} ${s.cm}`)] : [])].join(' · '),
    spoken: s.list([...bottom, ...numbers.map((n) => s.at(`${n} ${s.cm}`))]),
  };
}

function appearanceText(change, s, language, catalog) {
  const { subject: field, target } = change;
  const n = change.group.index;
  const [label, whose] = {
    carcass: () => [s.label[field], s.carcass],
    doors: () => [s.label[field], s.doors],
    door: () => [s.doorLabel(s.label[field], target.index), s.door(target.index)],
  }[target.kind]?.() ?? [s.itemLabel(s.label[field], s.part[target.kind].one), null];
  const before = refName(change.before, field, language, catalog);
  const after = refName(change.after, field, language, catalog);
  const what = whose ? s.of(s.the[field], whose) : s.itemProp(s.the[field], s.part[target.kind].one, n);
  return { label, before, after, spoken: s.changes(what, before, after) };
}

function lengthText(change, s) {
  const { subject, before, after, group } = change;
  const length = (mm) => `${cmShort(mm)} ${s.cm}`;
  let label = s.label[subject];
  let what = s.the[subject];
  if (subject === 'compartmentWidth') what = s.of(s.the.width, s.group.compartment(group.index));
  if (subject === 'partitionThickness') {
    label = s.partitionLabel(change.index);
    what = s.of(s.the.thickness, s.partition(change.index));
  }
  if (ITEM_PROP[subject]) {
    const part = s.part[subject === 'shelfThickness' ? 'shelf' : 'drawer'].one;
    what = s.itemProp(s.the[ITEM_PROP[subject]], part, group.index);
  }
  return { label, before: cmShort(before), after: length(after), spoken: s.changes(what, length(before), length(after)) };
}

/**
 * { label, before?, after?, detail?, spoken } for one change. Before/after are display values: the
 * unit appears only after the new value. `spoken` is the complete sentence for screen readers.
 */
export function describeChange(change, language, catalog) {
  const s = diffStringsFor(language);
  const { type, subject, group } = change;

  if (subject === 'compartment') {
    const label = type === 'added' ? s.compartmentAdded(change.index) : s.compartmentRemoved(change.index);
    const detail = s.wide(`${cmShort(change.values[0])} ${s.cm}`);
    return { label, detail, spoken: `${label}, ${detail}` };
  }
  if (s.part[subject]) {
    const part = s.part[subject];
    if (type === 'moved' && change.from === undefined) {
      const point = (y) => (y === 0 ? s.bottomValue : cmShort(y));
      const full = (y) => (y === 0 ? s.bottomValue : `${cmShort(y)} ${s.cm}`);
      return {
        label: part.one[0].toUpperCase() + part.one.slice(1),
        before: point(change.before),
        after: full(change.after),
        spoken: s.moves(part, group.index, full(change.before), full(change.after)),
      };
    }
    const where = heights(change.values, s);
    return {
      label: s.rowLabel(type, change.count, part, change.from),
      detail: where.detail,
      spoken: s.rowSpoken(type, change.count, part, group.index, where.spoken, change.from),
    };
  }
  if (LENGTHS.has(subject)) return lengthText(change, s);
  if (['material', 'color', 'finish'].includes(subject)) return appearanceText(change, s, language, catalog);
  if (subject === 'layout') {
    const counts = change.before === change.after ? {} : { before: String(change.before), after: String(change.after) };
    return { label: s.label.layout, ...counts, spoken: s.layoutSpoken(change.before, change.after) };
  }
  const values = {
    doorType: [s.label.doorType, s.the.doorType, (v) => s.doorType[v]],
    doorCount: [s.label.doorCount, s.the.doorCount, String],
    hinge: [s.doorLabel(s.label.hinge, change.target?.index), s.of(s.the.hinge, s.door(change.target?.index)), (v) => s.side[v]],
  }[subject];
  const [label, what, show] = values;
  const before = show(change.before);
  const after = show(change.after);
  return { label, before, after, spoken: s.changes(what, before, after) };
}
