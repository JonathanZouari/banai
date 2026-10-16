// Builds the carpenter dossier from the design state: one model → drawings, cut list, nesting,
// hardware, estimate and site checks. In production this runs in Python and renders the same
// HTML/CSS through WeasyPrint; here it runs in the browser for visual approval.
import { createState, layout, decorById, PRESETS, PANEL, PLINTH, cm } from '../../p1-workspace/js/model.js';
import { advisories } from '../../p1-workspace/js/advisories.js';
import { production, costEstimate, board, shekel, SHEET } from './production.js';
import { nest } from './nesting.js';
import { frontElevation, interiorElevation, compartmentElevation, planView, explodedView, sheetDrawing, edgeGlyph } from './drawings.js';

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (v != null && v !== false) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
};

// ---------- input ----------
function loadState() {
  try {
    const raw = sessionStorage.getItem('banai.dossier.state');
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked: fall back to the demo design */ }
  const s = createState();
  s.compartments = [
    { preset: 'long', split: false },
    { preset: 'double', split: false },
    { preset: 'drawers', split: false },
    { preset: 'shelves', split: false },
  ];
  return s;
}

const state = loadState();
const L = layout(state);
const prod = production(state, L);
const nesting = nest(prod.rows);
const cost = costEstimate(prod, nesting.byBoard);
const adv = advisories(state, L);
const rowsByNo = new Map(prod.rows.map((r) => [r.no, r]));
const META = {
  project: 'ארון חדר שינה',
  client: 'לקוח לדוגמה',
  id: 'BN-2026-0142',
  rev: 'טיוטה 3',
  date: new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date()),
};

const doorLabel = { hinged: 'ציר', sliding: 'הזזה', none: 'ללא (ארון פתוח)' }[state.doors.type];
const handleLabel = { bar: 'מוט', edge: 'פרופיל', none: 'לחיצה' }[state.doors.handle];
const presetName = (id) => PRESETS.find((p) => p.id === id)?.name ?? id;
const mm = (v) => h('span', { class: 'num' }, String(Math.round(v)));

// ---------- page frame ----------
const pages = [];
function page(title, { cls = '', toc = true } = {}) {
  const body = h('div', { class: 'page-body' });
  const el = h('section', { class: `page ${cls}` },
    cls.includes('cover') ? null : h('header', { class: 'page-head' }, h('h2', {}, title), h('span', { class: 'ph-meta' }, `${META.project} · ${META.id}`)),
    body,
    h('footer', { class: 'page-foot' },
      h('span', {}, 'הנחיה כללית, לא אישור הנדסי. כל מידה נבדקת באתר על ידי הנגר.'),
      h('span', {}, `${META.rev} · ${META.date}`),
      h('span', { class: 'pf-no' })));
  pages.push({ el, title, toc });
  return body;
}

// ---------- 1. cover ----------
const cover = page('שער', { cls: 'cover', toc: false });
const advWarn = adv.filter((a) => a.level !== 'info').length;
cover.append(
  h('div', { class: 'cover-top' },
    h('div', { class: 'cover-brand' }, logo(), 'בנאי'),
    h('span', { class: 'status' }, 'תכנון לקוח · לאימות באתר על ידי נגר')),
  h('div', {}, h('h1', {}, 'תיק נגר'), h('p', { class: 'subtitle' }, `${META.project} · ${META.client}`)),
  h('figure', { class: 'cover-render', style: 'margin:0' },
    h('img', { src: '../p1-workspace/screenshots/p1-render-clean.jpg', alt: 'רינדור path tracing של הארון' }),
    h('figcaption', {}, 'רינדור path tracing, מדויק לגיאומטריה. המחשה, לא צילום.')),
  h('dl', { class: 'spec-grid', style: 'margin:0' },
    spec('רוחב', `${cm(L.W)} ס״מ`), spec('גובה', `${cm(L.H)} ס״מ`), spec('עומק', `${cm(L.D)} ס״מ`), spec('תאים', String(L.n)),
    spec('דלתות', `${doorLabel}${L.doors.length ? ` · ${L.doors.length}` : ''}`), spec('ידיות', handleLabel),
    spec('גוף', decorById(state.decor.body).name), spec('חזיתות', decorById(state.decor.front).name)),
  h('div', { class: 'cover-cols' },
    h('div', {}, h('h3', {}, 'תוכן'), h('ol', { class: 'toc', id: 'toc' })),
    h('div', { class: 'summary-box' },
      h('p', { class: 'muted' }, 'אומדן חומרים בלבד, לפני עבודה'),
      h('p', { class: 'big' }, h('span', { class: 'num' }, `${shekel(cost.loVat)}–${shekel(cost.hiVat)}`)),
      h('p', { class: 'muted' }, `כולל מע״מ · ${nesting.sheets.length} לוחות · ${prod.rows.reduce((s, r) => s + r.qty, 0)} חלקים`),
      h('p', {}, advWarn ? `${advWarn === 1 ? 'אזהרה פתוחה אחת' : `${advWarn} אזהרות פתוחות`}, פירוט בעמוד האחרון` : 'אין אזהרות פתוחות. הערות מידע בעמוד האחרון.'))));

function spec(k, v) { return h('div', { class: 'spec' }, h('dt', {}, k), h('dd', {}, v)); }
function logo() {
  const t = document.createElement('template');
  t.innerHTML = '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="7" fill="#1d1d1f"/><rect x="7" y="6.5" width="14" height="15" rx="1.6" fill="none" stroke="#f5f5f7" stroke-width="1.6"/><path d="M14 6.5v15M12 13v2.4M16 13v2.4" stroke="#f5f5f7" stroke-width="1.6" stroke-linecap="round"/></svg>';
  return t.content.firstElementChild;
}

// ---------- 2. front + plan ----------
const p2 = page('חזית ותוכנית');
p2.append(
  h('p', { class: 'lead' }, 'כל המידות במילימטרים. החזית מוצגת עם דלתות סגורות. קווי הפתיחה מצביעים לצד הציר.'),
  h('figure', { class: 'fig', style: 'margin:0; flex:1.35' }, h('div', { class: 'fig-art' }, frontElevation(state, L)), h('figcaption', {}, `חזית · נישה ${Math.round(state.site.niche)} · תקרה ${Math.round(state.site.ceiling)} (מידות משוערות של הלקוח)`)),
  h('figure', { class: 'fig', style: 'margin:0; flex:1' }, h('div', { class: 'fig-art' }, planView(state, L)), h('figcaption', {}, 'תוכנית (חתך אופקי) · קשתות הפתיחה ומרחב הפתיחה הנדרש מול הארון')));

// ---------- 3. interior ----------
const p3 = page('פנים');
// Shop drawings follow the physical left-to-right order, even on an RTL page.
const compRow = h('div', { class: 'fig-row', style: `grid-template-columns: repeat(${Math.min(L.n, 4)}, 1fr); flex:1; direction:ltr` });
for (const c of L.comps.slice(0, 4)) {
  compRow.append(h('figure', { class: 'fig', style: 'margin:0' },
    h('div', { class: 'fig-art' }, compartmentElevation(state, L, c)),
    h('figcaption', { dir: 'rtl' }, `תא ${c.index + 1} · ${presetName(c.preset)} · גבהים מהרצפה`)));
}
p3.append(
  h('figure', { class: 'fig', style: 'margin:0; flex:1' }, h('div', { class: 'fig-art' }, interiorElevation(state, L)), h('figcaption', {}, 'פנים ללא דלתות. המסגרת המקווקוות מסמנות אזורי תלייה.')),
  compRow);

// ---------- 4. exploded ----------
const p4 = page('מבט מפוצץ');
const legend = h('table', {},
  h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'חלק'), h('th', { class: 'n' }, 'כמות'), h('th', {}, '#'), h('th', {}, 'חלק'), h('th', { class: 'n' }, 'כמות'))),
  h('tbody', {}, ...pairs(prod.rows.filter((r) => r.boxes.length)).map(([a, b]) => h('tr', {},
    h('td', {}, badge(a.no)), h('td', {}, a.name), h('td', { class: 'n' }, a.qty),
    h('td', {}, b ? badge(b.no) : ''), h('td', {}, b?.name ?? ''), h('td', { class: 'n' }, b?.qty ?? '')))));
p4.append(
  h('p', { class: 'lead' }, 'כל חלק מוזז מהמקום שלו בכיוון ההרכבה. המספרים תואמים לרשימת החיתוך. תיבות המגירה מוצגות כיחידה אחת.'),
  h('figure', { class: 'fig', style: 'margin:0; flex:1' }, h('div', { class: 'fig-art' }, explodedView(prod, L))),
  legend);
function pairs(arr) { const out = []; for (let i = 0; i < arr.length; i += 2) out.push([arr[i], arr[i + 1]]); return out; }
function badge(no) { return h('span', { class: 'part-badge' }, String(no)); }

// ---------- 5. materials, hardware, estimate ----------
const p5 = page('חומרים ופרזול');
const boards = [...nesting.byBoard.keys()];
p5.append(
  h('div', {}, h('h3', {}, 'שיטת בנייה מוצהרת'), h('ol', { class: 'lead', style: 'margin:0; padding-inline-start:5mm' }, ...prod.method.map((m) => h('li', {}, m)))),
  h('div', {}, h('h3', {}, 'לוחות'), h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'לוח'), h('th', {}, 'קוד'), h('th', {}, 'מצע'), h('th', { class: 'n' }, 'עובי'), h('th', {}, 'שימוש'), h('th', { class: 'n' }, 'לוחות'), h('th', { class: 'n' }, 'קנט (מ׳)'))),
    h('tbody', {}, ...boards.map((id) => {
      const b = board(id);
      const uses = [...new Set(prod.rows.filter((r) => r.decor === id).map((r) => r.group))].join(', ');
      const t = prod.rows.find((r) => r.decor === id)?.t;
      return h('tr', {}, h('td', {}, swatch(id), b.name), h('td', { class: 'num' }, b.code), h('td', {}, b.substrate), h('td', { class: 'n' }, `${t}`), h('td', {}, uses), h('td', { class: 'n' }, nesting.byBoard.get(id)), h('td', { class: 'n' }, prod.edgeM.get(id) ?? '—'));
    })))),
  h('div', {}, h('h3', {}, 'פרזול'), h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'פריט'), h('th', { class: 'n' }, 'כמות'), h('th', {}, 'מפרט'), h('th', {}, 'מקור'))),
    h('tbody', {}, ...prod.hw.map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'n' }, x.qty), h('td', {}, x.spec), h('td', { class: 'num muted' }, x.src)))))));
const p6 = page('אומדן עלות חומרים');
p6.append(
  h('p', { class: 'lead' }, 'אומדן חומרים בלבד, לפי כמויות רשימת החיתוך והשיבוץ. לא כולל עבודה, הובלה, התקנה ופינוי.'),
  h('div', {}, h('h3', {}, 'אומדן עלות חומרים (₪, לפני מע״מ)'), h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'פריט'), h('th', { class: 'n' }, 'כמות'), h('th', { class: 'n' }, 'מ-'), h('th', { class: 'n' }, 'עד'), h('th', {}, 'מקור'))),
    h('tbody', {}, ...cost.lines.map((l) => h('tr', {}, h('td', {}, l.name), h('td', { class: 'n' }, `${l.qty} ${l.unit}`), h('td', { class: 'n' }, shekel(l.lo)), h('td', { class: 'n' }, shekel(l.hi)), h('td', { class: 'num muted' }, l.src)))),
    h('tfoot', {},
      h('tr', {}, h('td', {}, 'סה״כ לפני מע״מ'), h('td', {}), h('td', { class: 'n' }, shekel(cost.lo)), h('td', { class: 'n' }, shekel(cost.hi)), h('td', {})),
      h('tr', {}, h('td', {}, 'כולל מע״מ 18%'), h('td', {}), h('td', { class: 'n' }, shekel(cost.loVat)), h('td', { class: 'n' }, shekel(cost.hiVat)), h('td', { class: 'num muted' }, '[73]')))),
  h('p', { class: 'lead muted', style: 'margin-top:1.5mm' }, `מחירים אינדיקטיביים מטבלת המחקר (§4.2). ללא עבודה, הובלה והתקנה. ${cost.missing.length ? `לא תומחר, כי אין מחיר במחקר: ${cost.missing.join(', ')}.` : ''}`)));

function swatch(id) {
  const b = board(id);
  const el = h('span', { class: 'swatch' });
  el.style.background = b.thumb ? `url("${b.thumb}") center / 300%` : b.color;
  return el;
}

// ---------- 6. cut list (paginated) ----------
const groupsOrder = ['גוף', 'גב', 'פנים', 'חזיתות', 'מגירות'];
const sorted = [...prod.rows].sort((a, b) => groupsOrder.indexOf(a.group) - groupsOrder.indexOf(b.group) || a.no - b.no);
const cutRows = [];
let lastGroup = null;
for (const r of sorted) {
  if (r.group !== lastGroup) { cutRows.push({ group: r.group }); lastGroup = r.group; }
  cutRows.push(r);
}
const PER_PAGE = 30;
for (let i = 0, part = 1; i < cutRows.length; i += PER_PAGE, part++) {
  const body = page(cutRows.length > PER_PAGE ? `רשימת חיתוך (${part})` : 'רשימת חיתוך', { toc: part === 1 });
  if (part === 1) body.append(h('p', { class: 'lead' }, `מידות גמר במ״מ, אחרי קנט. אורך = כיוון הסיב בדקורי עץ. kerf ‏${SHEET.kerf} מ״מ, שוליים ${SHEET.trim} מ״מ. סה״כ ${prod.rows.reduce((s, r) => s + r.qty, 0)} חלקים.`));
  body.append(h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'חלק'), h('th', { class: 'n' }, 'כמות'), h('th', { class: 'n' }, 'אורך'), h('th', { class: 'n' }, 'רוחב'), h('th', { class: 'n' }, 'עובי'), h('th', {}, 'לוח'), h('th', { class: 'c' }, 'סיב'), h('th', { class: 'c' }, 'קנט'), h('th', {}, 'הערה'))),
    h('tbody', {}, ...cutRows.slice(i, i + PER_PAGE).map((r) => (r.group && !r.no
      ? h('tr', { class: 'group-row' }, h('td', { colspan: 10 }, r.group))
      : h('tr', {},
        h('td', {}, badge(r.no)), h('td', {}, r.name), h('td', { class: 'n' }, r.qty), h('td', { class: 'n' }, Math.round(r.len)), h('td', { class: 'n' }, Math.round(r.wid)), h('td', { class: 'n' }, r.t),
        h('td', {}, swatch(r.decor), board(r.decor).name), h('td', { class: 'c grain-yes' }, r.grain ? '↕' : '—'), h('td', { class: 'c' }, edgeGlyph(r.edges)), h('td', { class: 'muted' }, r.note)))))));
}

// ---------- 7. nesting (two sheets per page) ----------
for (let i = 0; i < nesting.sheets.length; i += 2) {
  const body = page(nesting.sheets.length > 2 ? `שיבוץ לוחות (${i / 2 + 1})` : 'שיבוץ לוחות', { toc: i === 0 });
  if (i === 0) {
    body.append(h('p', { class: 'lead' }, `${nesting.sheets.length} לוחות · ניצולת ממוצעת ${Math.round(nesting.avgYield * 100)}% · חיתוך גיליוטינה (מקצה לקצה), kerf ‏${SHEET.kerf} מ״מ. בדקורי עץ החלקים לא מסובבים, כדי לשמור על כיוון הסיב.`));
    if (nesting.oversize.length) body.append(h('p', { class: 'lead bad' }, `חלקים גדולים מלוח: ${nesting.oversize.map((r) => `#${r.no}`).join(', ')}. צריך לפצל או להזמין לוח ארוך.`));
  }
  for (const sh of nesting.sheets.slice(i, i + 2)) {
    body.append(h('figure', { class: 'fig', style: 'margin:0; flex:1' }, h('div', { class: 'fig-art' }, sheetDrawing(sh, rowsByNo))));
  }
}

// ---------- 8. site, checks, advisories ----------
const p8 = page('אתר ובדיקות');
const diag = Math.hypot(L.H, L.D);
const liftOk = diag + 10 <= state.site.ceiling;
const maxDoor = state.doors.type === 'hinged' ? Math.max(...L.doors.map((d) => d.w)) : 0;
p8.append(
  h('div', {}, h('h3', {}, 'מידות אתר (משוערות, מפי הלקוח)'), h('dl', { class: 'kv', style: 'margin:0' },
    kv('גובה תקרה', mm(state.site.ceiling)), kv('רוחב נישה (הקטן מ-3)', mm(state.site.niche)), kv('פילר לכל צד', mm(Math.max(0, (state.site.niche - L.W) / 2))),
    kv('אלכסון הרמה √(H²+D²)', h('span', { class: liftOk ? 'ok' : 'bad' }, mm(diag), liftOk ? ' · עובר' : ' · לא עובר')),
    kv('עוגנים לשלד', `${prod.anchors} (לפי רוחב ${cm(L.W)} ס״מ)`), kv('מרחב פתיחה מול הארון', maxDoor ? mm(maxDoor) : 'הזזה, ללא'))),
  h('div', {}, h('h3', {}, 'לבדוק באתר לפני ייצור'), h('ul', { class: 'checks' },
    ...[
      'רוחב בשלושה גבהים. הקטן קובע.', 'גובה בשלוש נקודות, ופילוס רצפה ותקרה.', 'אנך הקירות ואלכסוני הנישה.',
      'פנלים, שקעים, מזגן, צנרת ותאורה בתחום הארון.', 'סוג הקיר לעיגון, וסריקת כבלים.', 'מסלול הכנסה מול החלק הגדול ביותר.',
      `אלכסון הרמה ${Math.round(diag)} מ״מ מול התקרה וגופי התאורה.`, 'לחות: קיר חיצוני או סמוך לחדר רחצה.', 'מלאי הלוח אצל הספק: 17 או 18 מ״מ.',
      'זמינות לוח 16 מ״מ לתיבות המגירה.', 'מרווח 2 ס״מ לפחות לדלת ציר ליד קיר.', 'עיגון לשלד ולא לגב. מספר העוגנים לפי הרוחב.',
    ].map((t) => h('li', {}, t)))));

// Advisories get their own page: inserts and doors can add many of them.
const p9 = page('הערות הייעוץ');
p9.append(
  h('div', {}, h('h3', {}, 'הערות הייעוץ'), ...adv.map((a) => h('div', { class: `adv adv--${a.level}` },
    h('span', { class: 'adv-level' }),
    h('div', {}, h('b', {}, a.title), ' · ', a.body, h('div', { class: 'adv-meta' }, `${a.grade} · מקור ${a.src}`))))),
  h('div', { class: 'declare' },
    'התיק הוא בריף תכנון מהלקוח לנגר, לא חוזה ולא אישור הנדסי. המידות משוערות עד מדידה באתר. רשימת החיתוך היא טיוטה לפי שיטת הבנייה המוצהרת בעמוד החומרים. טובין שמיוצרים לפי מידה אינם ניתנים לביטול [115]. לפני הזמנה, הנגר מאשר את המידות הסופיות בכתב.'));
function kv(k, v) { return h('div', {}, h('dt', {}, k), h('dd', {}, v)); }

// ---------- assemble ----------
const root = document.getElementById('pages');
pages.forEach((p, i) => {
  p.el.querySelector('.pf-no').textContent = `עמוד ${i + 1} מתוך ${pages.length}`;
  root.append(p.el);
});
const toc = document.getElementById('toc');
pages.forEach((p, i) => { if (p.toc) toc.append(h('li', {}, h('span', {}, p.title.replace(/ \(\d+\)$/, '')), h('span', { class: 'num' }, String(i + 1)))); });
document.getElementById('vbMeta').textContent = `${META.project} · ${pages.length} עמודים · ${META.rev}`;
document.getElementById('printBtn').addEventListener('click', () => window.print());
window.__dossier = { state, L, prod, nesting, cost, adv };
