// The PDF's content as plain data: no jsPDF, no DOM, so it is unit-testable in Node.
// Everything a reader sees (labels, names, units, finishes) is resolved here, in the chosen language.
// This is a description of the design, not a manufacturing document: there is no parts or cut list.
import { interiorHeight, interiorWidth } from '../domain/geometry.js';
import { DIRECTIONS, fill, translate } from '../i18n/strings.js';
import { lengthLabel } from '../ui/units.js';

/** Short stable fingerprint of a design (FNV-1a), so the same design always gets the same doc number. */
function fingerprint(design) {
  let hash = 0x811c9dc5;
  const text = JSON.stringify(design);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
}

const isoDate = (now) => now.toISOString().slice(0, 10);

/** "1–3" for a run of numbers, "1, 3" otherwise. */
function listNumbers(numbers) {
  if (numbers.length === 0) return '–';
  const isRun = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  return isRun && numbers.length > 1 ? `${numbers[0]}–${numbers.at(-1)}` : numbers.join(', ');
}

export function buildSpec(design, catalog, { lang = 'en', unit = 'cm', now = new Date() } = {}) {
  const tr = (key, values) => fill(translate(lang, key), values);
  const len = (mm) => lengthLabel(mm, unit);
  const nameOf = (section, id) => {
    const item = catalog[section]?.find((entry) => entry.id === id);
    return item ? (translate(lang, `cat_${id}`) ?? item.name) : id;
  };
  const refText = (ref, section) => (ref.custom ? tr('pdfCustom', { name: ref.name }) : nameOf(section, ref.catalogId));
  const appearanceText = (appearance) => [
    refText(appearance.material, 'materials'),
    refText(appearance.color, 'colors'),
    refText(appearance.finish, 'finishes'),
  ].join(', ');

  const { width, height, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const { doors } = design;
  const handleStyle = doors.handles.style;
  const hasDoors = doors.type !== 'none' && doors.items.length > 0;
  const handleCount = hasDoors && handleStyle !== 'none' ? doors.items.length : 0;
  const carcassFinish = appearanceText(design.carcass.appearance);
  const doorFinish = appearanceText(doors.appearance);

  const counts = { shelves: 0, drawers: 0, rails: 0 };
  const overrides = [];
  const compartments = design.compartments.map((compartment, index) => {
    const items = [];
    const add = (kind, label, position, appearance) => {
      const finish = kind === 'rails' ? '–' : appearance ? appearanceText(appearance) : carcassFinish;
      items.push({ kind, label, position, finish });
      counts[kind] += 1;
      if (appearance) overrides.push([`${tr('pdfColNo')} ${index + 1} · ${label}`, finish]);
    };
    compartment.shelves.forEach((shelf, i) => add('shelves', `${tr('edShelf')} ${i + 1}`, len(shelf.y), shelf.appearance));
    compartment.drawers.forEach((drawer, i) => add('drawers', `${tr('edDrawer')} ${i + 1}`, `${len(drawer.y)} – ${len(drawer.y + drawer.height)}`, drawer.appearance));
    compartment.rails.forEach((rail, i) => add('rails', `${tr('edRail')} ${i + 1}`, len(rail.y), null));
    return { no: index + 1, width: len(compartment.width), items };
  });

  const numberOf = new Map(design.compartments.map((c, i) => [c.id, i + 1]));
  const doorRows = hasDoors
    ? doors.items.map((door, i) => {
      const hinge = doors.type === 'hinged' && door.hingeSide ? tr(door.hingeSide === 'left' ? 'edLeft' : 'edRight') : '–';
      const own = door.appearance;
      if (own) overrides.push([tr('edDoorN', { n: i + 1 }), appearanceText(own)]);
      return {
        name: tr('edDoorN', { n: i + 1 }),
        covers: listNumbers(door.compartmentIds.map((id) => numberOf.get(id)).filter(Boolean)),
        hinge,
        front: tr(door.front === 'mirror' ? 'edFrontMirror' : 'edFrontPanel'),
        finish: own ? appearanceText(own) : doorFinish,
      };
    })
    : [];

  const doorsText = !hasDoors ? tr('pdfNoDoorsShort')
    : tr(doors.type === 'sliding' ? 'pdfSlidingPanels' : 'pdfHingedDoors', { n: doors.items.length });
  const overall = `${len(width)} × ${len(height)} × ${len(depth)}`;
  const dateText = isoDate(now);

  return {
    lang,
    dir: DIRECTIONS[lang] ?? 'ltr',
    unit,
    title: tr('pdfTitle'),
    project: tr('pdfProject'),
    docNo: `BAI-${dateText.replaceAll('-', '')}-${fingerprint(design)}`,
    dateText,
    fileName: `BanAI-wardrobe-${width}x${height}x${depth}-${dateText.replaceAll('-', '')}.pdf`,
    dimensionsMm: { width, height, depth },
    overall,
    doorsType: hasDoors ? doors.type : 'none',
    keyFigures: [
      [tr('pdfOverall'), overall],
      [tr('pdfCompartmentCount'), String(design.compartments.length)],
      [tr('pdfDoorsLine'), doorsText],
      [tr('pdfCarcass'), carcassFinish],
      [tr('pdfDoorFinish'), hasDoors ? doorFinish : '–'],
    ],
    general: [
      [tr('pdfOverall'), overall],
      [tr('pdfInteriorSize'), `${len(interiorWidth(design))} × ${len(interiorHeight(design))}`],
      [tr('pdfPanelThickness'), len(panel)],
      [tr('pdfPartitionThickness'), design.partitions.length ? [...new Set(design.partitions.map((p) => len(p.thickness)))].join(', ') : '–'],
      [tr('pdfCompartmentCount'), String(design.compartments.length)],
      [tr('pdfShelfCount'), String(counts.shelves)],
      [tr('pdfDrawerCount'), String(counts.drawers)],
      [tr('pdfRailCount'), String(counts.rails)],
      [tr('pdfDoorsLine'), doorsText],
    ],
    compartments,
    doors: { rows: doorRows, empty: !hasDoors, sliding: doors.type === 'sliding' },
    materials: [
      [tr('pdfCarcass'), carcassFinish],
      [tr('pdfDoorFinish'), hasDoors ? doorFinish : '–'],
    ],
    overrides,
    hardware: [
      [tr('pdfHandleStyle'), nameOf('handleStyles', handleStyle)],
      [tr('pdfHandleFinish'), handleStyle === 'none' ? '–' : nameOf('handleFinishes', doors.handles.finish)],
      [tr('pdfHandleCount'), String(handleCount)],
      [tr('pdfRailCount'), String(counts.rails)],
      [tr('pdfDrawerCount'), String(counts.drawers)],
    ],
    notes: [tr('pdfNote1'), tr('pdfNote2'), tr('pdfNote3'), tr('pdfNote4')],
  };
}
