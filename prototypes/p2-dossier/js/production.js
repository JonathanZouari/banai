// Production layer for the carpenter dossier: parts (cut list), hardware, edge banding and a
// material-cost estimate, all derived from the same layout as the 3D view.
// One declared construction method (characterization Q3); every number here is a draft for the
// carpenter to verify, never a manufacturing approval.
import { PANEL, PLINTH, decorById } from '../../p1-workspace/js/model.js';

export const SHEET = { L: 2440, W: 1220, trim: 10, kerf: 3.2 }; // board 244×122 [59–62], kerf 3.2 mm [108]
export const BACK = { t: 5, groove: 8, insert: 7 }; // back sits 7 mm into an 8 mm groove
const DRAWER_SIDE = 16; // concealed runners need 11–16 mm sides [32]
const RUNNER = 500; // runner length; box depth = runner − 10 [28]
const VAT = 0.18; // [73]

// Boards that are not design decors: drawer boxes and backs.
export const BOARDS = {
  snow16: { id: 'snow16', name: 'לבן 16 מ״מ', code: 'BN-W100-16', substrate: 'מלמין', color: '#f0efeb' },
  hdf5: { id: 'hdf5', name: 'HDF לבן 5 מ״מ', code: 'BN-HDF5', substrate: 'HDF', color: '#f4f3ef' },
};
export const board = (id) => BOARDS[id] ?? decorById(id);
export const hasGrain = (id) => Boolean(board(id).map);

export const METHOD = [
  'דפנות לכל הגובה. תקרה ורצפה בין הדפנות.',
  `גב ${BACK.t} מ״מ בחריץ של ${BACK.groove} מ״מ, מפוצל מאחורי מחיצות.`,
  `צוקל ${PLINTH} מ״מ בנסיגה של 30 מ״מ.`,
  'מחיצות בין הרצפה לתקרה, חיבור בקונפירמט.',
  'מדפים מתכווננים על פינים בשיטת System 32. מדף הכובעים קבוע.',
  `לוח ${PANEL} מ״מ (${SHEET.L}×${SHEET.W}). תיבות מגירה מלוח ${DRAWER_SIDE} מ״מ.`,
];

// Price ranges in ₪ excluding VAT, from the research price table (§4.2). `null` = no price there.
const PRICE = {
  sheetWhite: [220, 250, '[59][61]'],
  sheetColour: [240, 290, '[59][61][62]'],
  sheetVeneer: [350, 450, 'הנחה, אין מחיר במחקר'],
  sheetBack: [110, 145, '[59][60][62]'],
  edgeM: [6, 9.5, '[59][61][62]'],
  hinge110: [24, 24, '[77]'],
  hinge155: [49, 49, '[77]'],
  rail: [43, 51, '[79]'],
  anchor: [29, 49, '[80]'],
  slideKit: [299, 800, '[78]'],
  pulldown: [239, 239, '[43]'],
  runner: null,
  handle: null,
  trousers: null,
  led: null,
};

/** All production data for one design. */
export function production(state, L) {
  const P = PANEL;
  const { W, H, D } = L;
  const Hi = L.interiorH;
  const body = state.decor.body;
  const front = state.decor.front;
  const rows = [];
  const add = (r) => { rows.push({ qty: 1, edges: {}, note: '', boxes: [], ...r }); return rows.at(-1); };
  const box = (x0, y0, z0, x1, y1, z1, explode) => ({ min: [x0, y0, z0], max: [x1, y1, z1], explode });

  // Carcass.
  add({ name: 'דופן', group: 'גוף', qty: 2, len: H, wid: D, t: P, decor: body, edges: { l1: 1 },
    boxes: [box(0, 0, 0, P, H, D, [-1, 0, 0]), box(W - P, 0, 0, W, H, D, [1, 0, 0])] });
  add({ name: 'תקרה', group: 'גוף', len: W - 2 * P, wid: D, t: P, decor: body, edges: { l1: 1 },
    boxes: [box(P, H - P, 0, W - P, H, D, [0, 1, 0])] });
  add({ name: 'רצפה', group: 'גוף', len: W - 2 * P, wid: D, t: P, decor: body, edges: { l1: 1 },
    boxes: [box(P, PLINTH, 0, W - P, PLINTH + P, D, [0, -0.25, 0])] });
  add({ name: 'צוקל', group: 'גוף', len: W - 2 * P, wid: PLINTH - 4, t: P, decor: body, edges: {},
    boxes: [box(P, 0, D - 30 - P, W - P, PLINTH - 4, D - 30, [0, -1.9, 1.0])] });
  const partD = D - 30;
  if (L.n > 1) {
    add({ name: 'מחיצה', group: 'גוף', qty: L.n - 1, len: Hi, wid: partD, t: P, decor: body, edges: { l1: 1 },
      boxes: L.comps.slice(0, -1).map((c) => box(c.x0 + c.w, PLINTH + P, 13, c.x0 + c.w + P, H - P, 13 + partD, [0, 0, 0])) });
  }

  // Backs: split behind partitions so no piece is wider than a sheet allows.
  const backH = Hi + 2 * BACK.insert;
  // Each piece runs from the side groove (or a joint) to the centre of a partition, where the
  // joint is hidden; the outer edges sit BACK.insert mm into the side grooves.
  const maxBack = SHEET.W - 2 * SHEET.trim;
  const groups = [];
  for (const c of L.comps) {
    const g = groups.at(-1);
    const end = c.index === L.n - 1 ? W - P + BACK.insert : c.x0 + c.w + P / 2;
    if (g && end - g.xa <= maxBack) { g.xb = end; g.comps.push(c.index); } else groups.push({ xa: g ? g.xb : P - BACK.insert, xb: end, comps: [c.index] });
  }
  const backMap = new Map();
  for (const g of groups) {
    const wid = Math.round(g.xb - g.xa);
    const e = backMap.get(wid) ?? { comps: [], boxes: [] };
    e.comps.push(g.comps.map((i) => i + 1).join('–'));
    e.boxes.push(box(g.xa, PLINTH + P - BACK.insert, 3, g.xb, PLINTH + P - BACK.insert + backH, 8, [0, 0, -1.3]));
    backMap.set(wid, e);
  }
  for (const [wid, e] of backMap) {
    add({ name: 'גב', group: 'גב', qty: e.boxes.length, len: backH, wid, t: BACK.t, decor: 'hdf5', edges: {},
      note: `מאחורי ${e.comps.length > 1 ? 'תאים' : 'תא'} ⁦${e.comps.join(', ')}⁩`, boxes: e.boxes });
  }

  // Shelves, merged when sizes match.
  const shelfD = L.shelfDepth - 13;
  const shelfMap = new Map();
  for (const c of L.comps) {
    for (const s of c.shelves) {
      const key = c.w - 2;
      const e = shelfMap.get(key) ?? { comps: new Set(), boxes: [] };
      e.comps.add(c.index + 1);
      const y = PLINTH + P + s;
      e.boxes.push(box(c.x0 + 1, y, 13, c.x0 + c.w - 1, y + P, 13 + shelfD, [0, 0, 0.9]));
      shelfMap.set(key, e);
    }
  }
  for (const [len, e] of shelfMap) {
    add({ name: 'מדף', group: 'פנים', qty: e.boxes.length, len, wid: shelfD, t: P, decor: body, edges: { l1: 1 },
      note: `תאים ⁦${[...e.comps].join(', ')}⁩`, boxes: e.boxes });
  }

  // Fronts.
  const doorRows = new Map();
  if (state.doors.type === 'hinged') {
    for (const d of L.doors) {
      const key = `${d.w}x${d.h}${d.mirror ? 'm' : ''}`;
      const e = doorRows.get(key) ?? { d, boxes: [] };
      e.boxes.push(box(d.x0, PLINTH + 1.5, D + 1, d.x0 + d.w, PLINTH + 1.5 + d.h, D + 1 + P, [0, 0, 3.6]));
      doorRows.set(key, e);
    }
    for (const { d, boxes } of doorRows.values()) {
      add({ name: d.mirror ? 'דלת מראה' : 'דלת', group: 'חזיתות', qty: boxes.length, len: d.h, wid: d.w, t: P, decor: front,
        edges: { l1: 1, l2: 1, w1: 1, w2: 1 }, note: d.mirror ? 'מראה 4 מ״מ מודבקת, עם גיבוי בטיחות' : `${d.hinges} צירים`, boxes });
    }
  } else if (L.sliding) {
    const panelH = H - P - 40 - (PLINTH + P + 12) - 4;
    add({ name: 'כנף הזזה', group: 'חזיתות', qty: L.doors.length, len: panelH, wid: L.doors[0].w, t: P, decor: front,
      edges: { l1: 1, l2: 1, w1: 1, w2: 1 }, note: `חפיפה 20 מ״מ${state.doors.mirror ? ', אחת עם מראה' : ''}`,
      boxes: L.doors.map((d) => box(d.x0, PLINTH + P + 12, D - 60, d.x0 + d.w, PLINTH + P + 12 + panelH, D - 60 + P, [0, 0, 3.6])) });
  }

  // Drawers: fronts in the body decor (internal) or the front decor (open wardrobe).
  const drawerDecor = state.doors.type === 'none' ? front : body;
  const boxD = RUNNER - 10;
  let drawerCount = 0;
  for (const c of L.comps) {
    if (!c.drawers.length) continue;
    const n = c.drawers.length;
    drawerCount += n;
    const inner = c.w - 42; // [28]
    const fh = c.drawers[0].h;
    const sideH = fh - 64;
    add({ name: 'חזית מגירה', group: 'מגירות', qty: n, len: c.w - 4, wid: fh, t: P, decor: drawerDecor,
      edges: { l1: 1, l2: 1, w1: 1, w2: 1 }, note: `תא ${c.index + 1}`,
      boxes: c.drawers.map((dr) => {
        const y = PLINTH + P + dr.y + 3;
        return box(c.x0 + 2, y, 13 + shelfD - boxD - P, c.x0 + c.w - 2, y + dr.h, 13 + shelfD, [0, 0, 2.0]);
      }) });
    add({ name: 'דופן מגירה', group: 'מגירות', qty: 2 * n, len: boxD, wid: sideH, t: DRAWER_SIDE, decor: 'snow16', edges: { l1: 1 }, note: `תא ${c.index + 1}` });
    add({ name: 'גב וחזית פנימית', group: 'מגירות', qty: 2 * n, len: inner, wid: sideH - 13, t: DRAWER_SIDE, decor: 'snow16', edges: { l1: 1 }, note: `תא ${c.index + 1}` });
    add({ name: 'תחתית מגירה', group: 'מגירות', qty: n, len: inner, wid: boxD - 2 * DRAWER_SIDE, t: DRAWER_SIDE, decor: 'snow16', edges: {}, note: `תא ${c.index + 1}` });
  }

  // Interior inserts that are board parts: sloped shoe shelves.
  for (const c of L.comps) {
    if (!c.shoes) continue;
    add({ name: 'מדף נעליים משופע', group: 'פנים', qty: c.shoes.length, len: c.w - 2, wid: shelfD - 50, t: P, decor: body, edges: { l1: 1 },
      note: `תא ${c.index + 1} · שיפוע 14°`,
      boxes: c.shoes.map((tier) => { const y = PLINTH + P + tier.y + 90; return box(c.x0 + 1, y, 38, c.x0 + c.w - 1, y + P, 38 + shelfD - 50, [0, 0, 0.9]); }) });
  }

  rows.forEach((r, i) => { r.no = i + 1; r.grain = hasGrain(r.decor); });

  // Hardware.
  const hw = [];
  const hwAdd = (name, qty, spec, price, src = '') => { if (qty > 0) hw.push({ name, qty, spec, price, src }); };
  if (state.doors.type === 'hinged') {
    const drawerComps = new Set(L.comps.filter((c) => c.drawers.length).map((c) => c.index));
    const h155 = L.doors.filter((d) => drawerComps.has(d.comp)).reduce((s, d) => s + d.hinges, 0);
    const h110 = L.doors.reduce((s, d) => s + d.hinges, 0) - h155;
    hwAdd('ציר סמוי 110° עם טריקה שקטה', h110, 'כוס Ø35, עם פלטה', PRICE.hinge110, '[2][77]');
    hwAdd('ציר סמוי 155° ללא בליטה', h155, 'לדלתות מול מגירות (R10)', PRICE.hinge155, '[37][77]');
  }
  if (L.sliding) hwAdd('ערכת מסילות הזזה עליונה ותחתונה', 1, `${L.doors.length} כנפיים, עד 50 ק״ג לכנף`, PRICE.slideKit, '[10][78]');
  hwAdd('מסילות מגירה סמויות, טריקה שקטה', drawerCount, `זוג באורך ${RUNNER} מ״מ, דפנות 11–16 מ״מ`, PRICE.runner, '[28][32]');
  const rails = L.comps.flatMap((c) => c.rails.map(() => c));
  hwAdd('מוט תלייה Ø25', rails.length, 'חיתוך לפי רוחב התא', PRICE.rail, '[41][79]');
  hwAdd('תומך מוט (שושנה)', rails.reduce((s, c) => s + 2 + (c.w > 800 ? 1 : 0), 0), 'כולל תמיכה אמצעית מעל 80 ס״מ', null, '[41]');
  const handles = state.doors.handle === 'none' ? 0 : L.doors.length + drawerCount;
  if (state.doors.type !== 'sliding') hwAdd(state.doors.handle === 'edge' ? 'פרופיל ידית אנכי' : 'ידית מוט', handles, state.doors.handle === 'edge' ? 'אורך הדלת' : 'מרכזים 320 מ״מ, למגירות 128 מ״מ', PRICE.handle);
  if (state.doors.handle === 'none' && state.doors.type === 'hinged') hwAdd('מנגנון פתיחה בלחיצה', L.doors.length, 'עם ציר ללא קפיץ, בלי טריקה שקטה', null, '[16]');
  hwAdd('פין מדף', rows.filter((r) => r.name === 'מדף').reduce((s, r) => s + r.qty, 0) * 4, 'Ø5, System 32', null, '[27]');
  hwAdd('מתקן תלייה נשלף (פנטוגרף)', L.comps.filter((c) => c.pulldown).length, 'רוחב 83–115 ס״מ, עד 10 ק״ג', PRICE.pulldown, '[43]');
  hwAdd('מתקן מכנסיים נשלף', L.comps.filter((c) => c.trousers).length, 'מסילות שליפה מתחת למדף, 10–14 מוטות', PRICE.trousers);
  const shoeTiers = L.comps.reduce((s, c) => s + (c.shoes?.length ?? 0), 0);
  hwAdd('מוט חזית למדף נעליים', shoeTiers, 'Ø10, חיתוך לפי רוחב התא', null);
  const lit = L.comps.filter((c) => c.led);
  hwAdd('פס LED עם חיישן דלת', lit.length, `${(lit.reduce((s, c) => s + (c.w - 40), 0) / 1000).toFixed(1)} מ׳ בסך הכול, ספק 12V מוסתר`, PRICE.led, '§6');
  const anchors = 2 + Math.max(0, Math.ceil((W - 1200) / 600)); // [103]
  hwAdd('זווית עיגון מגולוונת', anchors, 'לשלד הקיר, לא לגב. בורג 8 מ״מ ודיבל לפי סוג הקיר', PRICE.anchor, '[103]');
  const joints = 4 + 2 * (L.n - 1) + 2;
  hwAdd('בורג קונפירמט (אומדן)', joints * 3, '3 לכל חיבור', null);

  // Edge banding per decor, +10% allowance.
  const edgeM = new Map();
  for (const r of rows) {
    const e = r.edges;
    const mm = ((e.l1 ? 1 : 0) + (e.l2 ? 1 : 0)) * r.len + ((e.w1 ? 1 : 0) + (e.w2 ? 1 : 0)) * r.wid;
    if (mm) edgeM.set(r.decor, (edgeM.get(r.decor) ?? 0) + (mm * r.qty) / 1000);
  }
  for (const [k, v] of edgeM) edgeM.set(k, Math.ceil(v * 1.1));

  return { rows, hw, edgeM, method: METHOD, anchors, price: PRICE };
}

/** Material-cost estimate from the nesting result. Ranges in ₪; labour excluded. */
export function costEstimate(prod, sheetsByBoard) {
  const lines = [];
  for (const [id, count] of sheetsByBoard) {
    const b = board(id);
    const p = id === 'hdf5' ? PRICE.sheetBack : b.substrate === 'פורניר' ? PRICE.sheetVeneer : id === 'snow' || id === 'snow16' ? PRICE.sheetWhite : PRICE.sheetColour;
    lines.push({ name: `לוח ${b.name}`, qty: count, unit: 'לוח', lo: p[0] * count, hi: p[1] * count, src: p[2] });
  }
  for (const [id, m] of prod.edgeM) {
    lines.push({ name: `קנט ${board(id).name}`, qty: m, unit: 'מ׳', lo: PRICE.edgeM[0] * m, hi: PRICE.edgeM[1] * m, src: PRICE.edgeM[2] });
  }
  const missing = [];
  for (const h of prod.hw) {
    if (h.price) lines.push({ name: h.name, qty: h.qty, unit: 'יח׳', lo: h.price[0] * h.qty, hi: h.price[1] * h.qty, src: h.price[2] });
    else if (h.price === null && ['מסילות מגירה סמויות, טריקה שקטה', 'ידית מוט', 'פרופיל ידית אנכי', 'מתקן מכנסיים נשלף', 'פס LED עם חיישן דלת'].includes(h.name)) missing.push(h.name);
  }
  const lo = lines.reduce((s, l) => s + l.lo, 0);
  const hi = lines.reduce((s, l) => s + l.hi, 0);
  return { lines, lo, hi, loVat: lo * (1 + VAT), hiVat: hi * (1 + VAT), missing };
}

export const shekel = (v) => `₪${Math.round(v).toLocaleString('he-IL')}`;
