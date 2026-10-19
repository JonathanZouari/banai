// Carpenter instructions derived from the canonical design: overview, cut list, assembly steps
// and the measurements for a front elevation drawing. Pure: (design, catalog, language) -> data,
// already localized, so the page renderer only draws. The design is never changed.
//
// PROPOSAL (not in the approved scope, spec §22): this is a helper document, not a manufacturing
// spec. The app never claims a design is manufacturable, so every page carries DISCLAIMER and the
// construction method below is an assumed default the carpenter must verify.
import { compartmentXRanges, interiorHeight, interiorWidth, partitionLeftEdge } from '../domain/geometry.js';

// ASSUMPTION: configurable prototype values for an assumed construction method (sides full
// height, top and bottom between the sides, back panel fitted inside, inset doors). They are NOT
// part of the design model and NOT manufacturing specifications. Kept separate from viewer VISUAL,
// which is render-only.
export const ASSUMED_CONSTRUCTION = Object.freeze({
  backThickness: 6,
  doorThickness: 18,
  doorGap: 2,
  drawerGap: 3,
  slidingOverlap: 60,
});

const STRINGS = Object.freeze({
  he: Object.freeze({
    dir: 'rtl',
    title: 'הוראות לנגר',
    subtitle: 'מסמך עזר שנוצר מהעיצוב ב-BanAI',
    disclaimer: 'מסמך עזר בלבד. לא נבדק להיתכנות ייצור או הנדסית. על הנגר לאמת את כל המידות, שיטת הבנייה והפרזול לפני חיתוך.',
    illustration: 'אילוסטרציה: מבט תלת-ממדי של העיצוב (להמחשה בלבד)',
    pages: Object.freeze({ cover: 'סקירה', drawing: 'שרטוט חזית (פנים, בלי דלתות)', cutList: 'רשימת חיתוך', steps: 'שלבי הרכבה' }),
    pageOf: (n, total) => `עמוד ${n} מתוך ${total}`,
    units: 'כל המידות במילימטרים (מ"מ).',
    overview: Object.freeze({
      size: 'מידות חיצוניות (רוחב × גובה × עומק)',
      interior: 'מידות פנים (רוחב × גובה)',
      panel: 'עובי לוחות הגוף',
      compartments: 'מספר תאים',
      doors: 'דלתות',
      carcass: 'גוף ומדפים',
      doorFinish: 'חזית הדלתות',
    }),
    doorTypes: Object.freeze({ hinged: 'דלתות ציר', sliding: 'דלתות הזזה', none: 'ללא דלתות' }),
    count: (n, word) => `${n} ${word}`,
    doorWord: 'כנפיים',
    compartment: (i) => `תא ${i}`,
    compartmentLine: Object.freeze({
      width: (w) => `רוחב פנים ${w}`,
      shelf: (y, t) => `מדף בגובה ${y} מעל הבסיס, עובי ${t}`,
      drawer: (y, h) => `פתח מגירה מ-${y} עד ${y + h} מעל הבסיס (גובה ${h})`,
      rail: (y) => `מוט תלייה בגובה ${y} מעל הבסיס`,
      empty: 'תא ריק',
    }),
    cutHeaders: Object.freeze(['חלק', 'כמות', 'אורך', 'רוחב', 'עובי', 'חומר / צבע / גימור']),
    parts: Object.freeze({
      side: 'דופן צד',
      topBottom: 'עליון / תחתון',
      back: 'גב',
      partition: (i) => `מחיצה ${i}`,
      shelf: (i) => `מדף, תא ${i}`,
      drawerFront: (i) => `חזית מגירה, תא ${i}`,
      door: (i, side) => `דלת ${i} (ציר ${side === 'left' ? 'שמאל' : 'ימין'})`,
      sliding: (i) => `כנף הזזה ${i}`,
      rail: (i) => `מוט תלייה, תא ${i}`,
      railMaterial: 'מתכת (לפי בחירת הנגר)',
    }),
    steps: Object.freeze({
      cut: 'לחתוך את כל הלוחות לפי רשימת החיתוך, ולבדוק כל לוח מול השרטוט.',
      carcass: (w, h) => 'לחבר את הדפנות לעליון ולתחתון (העליון והתחתון נכנסים בין הדפנות). '
        + `לוודא שהגוף ישר ושמידות הפנים הן ${w} × ${h}.`,
      partition: (i, x) => `להתקין את מחיצה ${i}: הפאה השמאלית שלה במרחק ${x} מהפאה הפנימית של הדופן השמאלית.`,
      shelves: (i, ys) => `תא ${i}: להתקין מדפים בגבהים ${ys.join(', ')} מעל הפאה העליונה של התחתון.`,
      drawers: (i, list) => `תא ${i}: להתקין מגירות בפתחים ${list.join(', ')}.`,
      rails: (i, ys) => `תא ${i}: להתקין מוט תלייה בגובה ${ys.join(', ')}.`,
      back: 'להתקין את הגב מאחור, בין הדפנות, העליון והתחתון.',
      hinged: (n) => `לתלות ${n} דלתות ציר לפי צד הציר שברשימת החיתוך, ולכוונן מרווחים.`,
      sliding: (n) => `להתקין מסילות עליונה ותחתונה, ולהכניס ${n} כנפי הזזה לסירוגין במסילה האחורית והקדמית.`,
      check: 'להשוות את הארון המוגמר לשרטוט ולאילוסטרציה, ולכוונן לפי הצורך.',
    }),
    notSpecifiedTitle: 'לא מוגדר בעיצוב (לקביעת הנגר)',
    notSpecified: Object.freeze([
      'ארגזי מגירות ומסילות מגירה',
      'צירים, ידיות ומסילות לדלתות הזזה',
      'ברגים, חיבורים, קנטים ותושבות למדפים',
      'עיגון לקיר ופילוס',
    ]),
    assumptionsTitle: 'הנחות בנייה (ערכי ברירת מחדל, יש לאמת)',
    assumptions: (a) => [
      `עובי גב ${a.backThickness}`,
      `עובי דלת ${a.doorThickness}, מרווח סביב דלת ${a.doorGap}`,
      `מרווח סביב חזית מגירה ${a.drawerGap}`,
      `חפיפה בין כנפי הזזה ${a.slidingOverlap}`,
      'הדלתות נכנסות בין הדפנות (inset)',
    ],
  }),
  en: Object.freeze({
    dir: 'ltr',
    title: 'Carpenter instructions',
    subtitle: 'Helper document generated from the BanAI design',
    disclaimer: 'Helper document only. Not checked for manufacturing or engineering feasibility. The carpenter must verify all measurements, construction and hardware before cutting.',
    illustration: 'Illustration: 3D view of the design (illustrative only)',
    pages: Object.freeze({ cover: 'Overview', drawing: 'Front elevation (interior, doors removed)', cutList: 'Cut list', steps: 'Assembly steps' }),
    pageOf: (n, total) => `Page ${n} of ${total}`,
    units: 'All measurements are in millimetres (mm).',
    overview: Object.freeze({
      size: 'Outer size (W × H × D)',
      interior: 'Interior size (W × H)',
      panel: 'Carcass panel thickness',
      compartments: 'Compartments',
      doors: 'Doors',
      carcass: 'Carcass and shelves',
      doorFinish: 'Door fronts',
    }),
    doorTypes: Object.freeze({ hinged: 'Hinged doors', sliding: 'Sliding doors', none: 'No doors' }),
    count: (n, word) => `${n} ${word}`,
    doorWord: 'panels',
    compartment: (i) => `Compartment ${i}`,
    compartmentLine: Object.freeze({
      width: (w) => `Interior width ${w}`,
      shelf: (y, t) => `Shelf at ${y} above the base, ${t} thick`,
      drawer: (y, h) => `Drawer opening from ${y} to ${y + h} above the base (${h} high)`,
      rail: (y) => `Hanging rail at ${y} above the base`,
      empty: 'Empty compartment',
    }),
    cutHeaders: Object.freeze(['Part', 'Qty', 'Length', 'Width', 'Thickness', 'Material / colour / finish']),
    parts: Object.freeze({
      side: 'Side panel',
      topBottom: 'Top / bottom',
      back: 'Back panel',
      partition: (i) => `Partition ${i}`,
      shelf: (i) => `Shelf, compartment ${i}`,
      drawerFront: (i) => `Drawer front, compartment ${i}`,
      door: (i, side) => `Door ${i} (hinge ${side})`,
      sliding: (i) => `Sliding panel ${i}`,
      rail: (i) => `Hanging rail, compartment ${i}`,
      railMaterial: 'Metal (carpenter to choose)',
    }),
    steps: Object.freeze({
      cut: 'Cut all panels according to the cut list, and check each one against the drawing.',
      carcass: (w, h) => 'Join the sides to the top and bottom (top and bottom fit between the sides). '
        + `Check the carcass is square and the interior is ${w} × ${h}.`,
      partition: (i, x) => `Fix partition ${i} with its left face ${x} from the inner face of the left side.`,
      shelves: (i, ys) => `Compartment ${i}: fit shelves at ${ys.join(', ')} above the top face of the bottom panel.`,
      drawers: (i, list) => `Compartment ${i}: fit drawers in the openings ${list.join(', ')}.`,
      rails: (i, ys) => `Compartment ${i}: fit a hanging rail at ${ys.join(', ')}.`,
      back: 'Fit the back panel between the sides, top and bottom.',
      hinged: (n) => `Hang ${n} hinged doors on the hinge sides given in the cut list, and adjust the gaps.`,
      sliding: (n) => `Fit the top and bottom tracks, then insert ${n} sliding panels, alternating back and front track.`,
      check: 'Compare the finished wardrobe with the drawing and the illustration, and adjust as needed.',
    }),
    notSpecifiedTitle: 'Not specified by the design (carpenter to decide)',
    notSpecified: Object.freeze([
      'Drawer boxes and drawer runners',
      'Hinges, handles and sliding-door tracks',
      'Screws, joints, edge banding and shelf supports',
      'Wall fixing and levelling',
    ]),
    assumptionsTitle: 'Construction assumptions (default values, verify)',
    assumptions: (a) => [
      `Back panel ${a.backThickness} thick`,
      `Door ${a.doorThickness} thick, ${a.doorGap} gap around each door`,
      `${a.drawerGap} gap around each drawer front`,
      `${a.slidingOverlap} overlap between sliding panels`,
      'Doors are inset between the sides',
    ],
  }),
});

export const stringsForExport = (language) => STRINGS[language] ?? STRINGS.he;

function refName(ref, section, catalog) {
  if (!ref) return '';
  if (ref.custom) return ref.name;
  return catalog?.[section]?.find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId;
}

export function appearanceName(appearance, catalog) {
  return [
    refName(appearance.material, 'materials', catalog),
    refName(appearance.color, 'colors', catalog),
    refName(appearance.finish, 'finishes', catalog),
  ].filter(Boolean).join(' / ');
}

/** Identical rows (same part label, size and material) are merged into one row with a quantity. */
function addRow(rows, row) {
  const key = [row.part, row.length, row.width, row.thickness, row.material].join('|');
  const existing = rows.find((r) => r.key === key);
  if (existing) existing.qty += row.qty;
  else rows.push({ ...row, key });
}

function cutList(design, catalog, s, a) {
  const { width, height, depth } = design.dimensions;
  const t = design.carcass.panelThickness;
  const innerW = interiorWidth(design);
  const innerH = interiorHeight(design);
  const innerDepth = depth - a.backThickness;
  const carcassName = appearanceName(design.carcass.appearance, catalog);
  const rows = [];
  addRow(rows, { part: s.parts.side, qty: 2, length: height, width: depth, thickness: t, material: carcassName });
  addRow(rows, { part: s.parts.topBottom, qty: 2, length: innerW, width: depth, thickness: t, material: carcassName });
  addRow(rows, { part: s.parts.back, qty: 1, length: innerH, width: innerW, thickness: a.backThickness, material: carcassName });
  design.partitions.forEach((p, i) => {
    addRow(rows, { part: s.parts.partition(i + 1), qty: 1, length: innerH, width: innerDepth, thickness: p.thickness, material: carcassName });
  });
  design.compartments.forEach((c, ci) => {
    c.shelves.forEach((shelf) => {
      addRow(rows, {
        part: s.parts.shelf(ci + 1), qty: 1, length: c.width, width: innerDepth, thickness: shelf.thickness,
        material: appearanceName(shelf.appearance ?? design.carcass.appearance, catalog),
      });
    });
    c.drawers.forEach((drawer) => {
      addRow(rows, {
        part: s.parts.drawerFront(ci + 1), qty: 1, length: c.width - 2 * a.drawerGap, width: drawer.height - 2 * a.drawerGap,
        thickness: t, material: appearanceName(drawer.appearance ?? design.carcass.appearance, catalog),
      });
    });
    c.rails.forEach(() => {
      addRow(rows, { part: s.parts.rail(ci + 1), qty: 1, length: c.width, width: null, thickness: null, material: s.parts.railMaterial });
    });
  });
  const doorHeight = innerH - 2 * a.doorGap;
  const doorName = (door) => appearanceName(door.appearance ?? design.doors.appearance, catalog);
  if (design.doors.type === 'hinged') {
    const ranges = new Map(design.compartments.map((c, i) => [c.id, compartmentXRanges(design)[i]]));
    design.doors.items.forEach((door, i) => {
      const x0 = ranges.get(door.compartmentIds[0])[0];
      const x1 = ranges.get(door.compartmentIds.at(-1))[1];
      addRow(rows, { part: s.parts.door(i + 1, door.hingeSide), qty: 1, length: doorHeight, width: x1 - x0 - 2 * a.doorGap, thickness: a.doorThickness, material: doorName(door) });
    });
  } else if (design.doors.type === 'sliding') {
    const n = design.doors.items.length;
    const overlap = n > 1 ? a.slidingOverlap : 0;
    const panelWidth = Math.round((innerW + (n - 1) * overlap) / n);
    design.doors.items.forEach((door, i) => {
      addRow(rows, { part: s.parts.sliding(i + 1), qty: 1, length: doorHeight, width: panelWidth, thickness: a.doorThickness, material: doorName(door) });
    });
  }
  return rows.map(({ key, ...row }) => row);
}

function assemblySteps(design, s) {
  const steps = [s.steps.cut, s.steps.carcass(interiorWidth(design), interiorHeight(design))];
  design.partitions.forEach((_, i) => steps.push(s.steps.partition(i + 1, partitionLeftEdge(design, i))));
  design.compartments.forEach((c, ci) => {
    const byY = (items) => [...items].sort((p, q) => p.y - q.y);
    if (c.shelves.length) steps.push(s.steps.shelves(ci + 1, byY(c.shelves).map((x) => x.y)));
    if (c.drawers.length) steps.push(s.steps.drawers(ci + 1, byY(c.drawers).map((d) => `${d.y}–${d.y + d.height}`)));
    if (c.rails.length) steps.push(s.steps.rails(ci + 1, byY(c.rails).map((r) => r.y)));
  });
  steps.push(s.steps.back);
  const n = design.doors.items.length;
  if (design.doors.type === 'hinged') steps.push(s.steps.hinged(n));
  if (design.doors.type === 'sliding') steps.push(s.steps.sliding(n));
  steps.push(s.steps.check);
  return steps;
}

/** Measurements for the front elevation, in outer mm (x from the outer left face, y from the floor). */
function drawing(design) {
  const t = design.carcass.panelThickness;
  const ranges = compartmentXRanges(design).map(([x0, x1]) => [t + x0, t + x1]);
  return {
    width: design.dimensions.width,
    height: design.dimensions.height,
    panel: t,
    compartments: design.compartments.map((c, i) => ({
      x0: ranges[i][0],
      x1: ranges[i][1],
      width: c.width,
      shelves: c.shelves.map((shelf) => ({ y: t + shelf.y, thickness: shelf.thickness })),
      drawers: c.drawers.map((d) => ({ y: t + d.y, height: d.height })),
      rails: c.rails.map((r) => ({ y: t + r.y })),
    })),
    partitions: design.partitions.map((p, i) => ({ x: ranges[i][1], thickness: p.thickness })),
  };
}

export function buildCarpenterPlan(design, catalog, language = 'he', assumed = ASSUMED_CONSTRUCTION) {
  const s = stringsForExport(language);
  const { width, height, depth } = design.dimensions;
  const doorType = design.doors.type;
  const doorValue = doorType === 'none' ? s.doorTypes.none : `${s.doorTypes[doorType]}, ${s.count(design.doors.items.length, s.doorWord)}`;
  return {
    language: STRINGS[language] ? language : 'he',
    dir: s.dir,
    title: s.title,
    subtitle: s.subtitle,
    disclaimer: s.disclaimer,
    illustration: s.illustration,
    pageTitles: s.pages,
    pageOf: s.pageOf,
    units: s.units,
    overview: [
      { label: s.overview.size, value: `${width} × ${height} × ${depth}` },
      { label: s.overview.interior, value: `${interiorWidth(design)} × ${interiorHeight(design)}` },
      { label: s.overview.panel, value: String(design.carcass.panelThickness) },
      { label: s.overview.compartments, value: String(design.compartments.length) },
      { label: s.overview.doors, value: doorValue },
      { label: s.overview.carcass, value: appearanceName(design.carcass.appearance, catalog) },
      ...(doorType === 'none' ? [] : [{ label: s.overview.doorFinish, value: appearanceName(design.doors.appearance, catalog) }]),
    ],
    compartments: design.compartments.map((c, ci) => {
      const lines = [s.compartmentLine.width(c.width)];
      [...c.shelves].sort((p, q) => p.y - q.y).forEach((x) => lines.push(s.compartmentLine.shelf(x.y, x.thickness)));
      [...c.drawers].sort((p, q) => p.y - q.y).forEach((d) => lines.push(s.compartmentLine.drawer(d.y, d.height)));
      [...c.rails].sort((p, q) => p.y - q.y).forEach((r) => lines.push(s.compartmentLine.rail(r.y)));
      if (lines.length === 1) lines.push(s.compartmentLine.empty);
      return { title: s.compartment(ci + 1), lines };
    }),
    cutHeaders: s.cutHeaders,
    cutList: cutList(design, catalog, s, assumed),
    steps: assemblySteps(design, s),
    notSpecifiedTitle: s.notSpecifiedTitle,
    notSpecified: s.notSpecified,
    assumptionsTitle: s.assumptionsTitle,
    assumptions: s.assumptions(assumed),
    drawing: drawing(design),
  };
}
