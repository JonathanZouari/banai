// The cabinetmaker sheet as three A4 pages of Hebrew (RTL) HTML. Text is set with textContent
// only. exportPdf.js turns the pages into a PDF; tests inspect the DOM directly.
import { checkDesign } from './checks.js';
import { cutList, describeAppearance, edgeBandMetres, hardwareList } from './cutList.js';
import { frontElevationSvg, sideSectionSvg } from './drawing.js';
import { DISCLAIMER, SOURCES, STANDARDS } from './standards.js';

const cm = (mm) => (mm / 10).toFixed(1);
const DOOR_TYPE = Object.freeze({ hinged: 'דלתות פתיחה (ציר)', sliding: 'דלתות הזזה', none: 'ללא דלתות' });
const LEVEL = Object.freeze({ warn: '⚠', info: 'ℹ', ok: '✓' });

function factory(doc) {
  return (tag, { className, text, attrs = {} } = {}, children = []) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    element.append(...children);
    return element;
  };
}

function table(h, headers, rows) {
  return h('table', { className: 'maker-table' }, [
    h('thead', {}, [h('tr', {}, headers.map((text) => h('th', { text })))]),
    h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((text) => h('td', { text: String(text) }))))),
  ]);
}

function page(h, number, children) {
  return h('section', { className: 'maker-page', attrs: { dir: 'rtl', lang: 'he', 'data-page': String(number) } }, [
    ...children,
    h('footer', { className: 'maker-page__footer', text: `BanAI · הוראות לנגר · עמוד ${number} מתוך 3` }),
  ]);
}

function compartmentSummary(design) {
  return design.compartments.map((c, i) => {
    const parts = [];
    if (c.shelves.length) parts.push(`${c.shelves.length} מדפים`);
    if (c.drawers.length) parts.push(`${c.drawers.length} מגירות`);
    if (c.rails.length) parts.push(`${c.rails.length} מוטות תלייה`);
    return `תא ${i + 1} (${cm(c.width)} ס"מ): ${parts.join(', ') || 'ריק'}`;
  });
}

/** Three A4 page elements. `snapshot` is an optional 3D image data URL. */
export function buildSheet({ design, catalog, snapshot = null, reference, date = new Date(), doc = document }) {
  const h = factory(doc);
  const { width, height, depth } = design.dimensions;
  const findings = checkDesign(design);
  const parts = cutList(design, catalog);
  const hardware = hardwareList(design);
  const disclaimer = () => h('p', { className: 'maker-disclaimer', text: DISCLAIMER });

  const summary = h('ul', { className: 'maker-summary' }, [
    `מידות חוץ: רוחב ${cm(width)} × גובה ${cm(height)} × עומק ${cm(depth)} ס"מ`,
    `גוף ומדפים: ${describeAppearance(design.carcass.appearance, catalog)}, עובי ${design.carcass.panelThickness} מ"מ`,
    `דלתות: ${DOOR_TYPE[design.doors.type]}${design.doors.type === 'none' ? '' : ` (${design.doors.items.length}) – ${describeAppearance(design.doors.appearance, catalog)}`}`,
    ...compartmentSummary(design),
  ].map((text) => h('li', { text })));

  const header = h('header', { className: 'maker-header' }, [
    h('h1', { text: 'הוראות לנגר – ארון בגדים' }),
    h('p', { text: `הזמנה ${reference} · ${date.toLocaleDateString('he-IL')}` }),
  ]);

  const figure = (caption, content) => h('figure', { className: 'maker-figure' }, [content, h('figcaption', { text: caption })]);

  const page1 = page(h, 1, [
    header,
    summary,
    h('div', { className: 'maker-figures' }, [
      figure('חזית (ללא דלתות). גובה מדפים מהרצפה, בס"מ. קו מקווקו: כיוון פתיחת דלת.', frontElevationSvg(design, doc)),
      ...(snapshot ? [figure('הדמיה תלת-ממדית (להמחשה בלבד)', h('img', { attrs: { src: snapshot, alt: 'הדמיה תלת-ממדית של הארון' } }))] : []),
    ]),
    disclaimer(),
  ]);

  const page2 = page(h, 2, [
    h('h2', { text: 'חתך צד ושורות קידוח System 32' }),
    h('div', { className: 'maker-section' }, [
      figure('חתך צד (גב משמאל, חזית מימין).', sideSectionSvg(design, doc)),
      h('ul', { className: 'maker-notes' }, [
        `עומק הגוף ${cm(depth)} ס"מ${design.doors.type === 'none' ? '' : ', ועוד עובי הדלת בחזית'}.`,
        `שתי שורות חורים לכל דופן ומחיצה: ${STANDARDS.system32.setback} מ"מ מהקצה הקדמי ומהאחורי, כל ${STANDARDS.system32.pitch} מ"מ.`,
        'השורות משמשות לתומכי מדף, צירים ומסילות – כך המדפים מתכווננים.',
        `גב ${STANDARDS.backPanel.material} ${STANDARDS.backPanel.min}–${STANDARDS.backPanel.max} מ"מ, מוסמר או בחריץ (מידות הגב ברשימה – לגב מוסמר).`,
        `צוקל מקווקו = מומלץ (${cm(STANDARDS.plinth.min)}–${cm(STANDARDS.plinth.max)} ס"מ), אינו חלק מהמודל.`,
      ].map((text) => h('li', { text }))),
    ]),
    h('h2', { text: 'רשימת חיתוך (מ"מ)' }),
    table(h, ['חלק', 'כמות', 'אורך', 'רוחב', 'עובי', 'חומר / גימור', 'קנט'],
      parts.map((p) => [p.name, p.quantity, p.length, p.width, p.thickness, p.finish, p.edges === 4 ? '4 צדדים' : p.edges ? 'קדמי' : '—'])),
    h('p', { className: 'maker-note', text: `סה"כ ${parts.reduce((n, p) => n + p.quantity, 0)} חלקים · כ-${edgeBandMetres(parts)} מ' קנט ${STANDARDS.edgeBand.types} ${STANDARDS.edgeBand.thickness} מ"מ. מידות הדלתות לפי המודל – יש להתאים לסוג הציר (Overlay / Inset) ולמרווחי היצרן.` }),
    h('h2', { text: 'פרזול' }),
    table(h, ['פריט', 'כמות'], hardware.map((item) => [item.name, item.quantity ?? 'לפי רשימת החיתוך'])),
  ]);

  const page3 = page(h, 3, [
    h('h2', { text: 'בדיקה מול כללי אצבע מקובלים' }),
    h('ul', { className: 'maker-checks' }, findings.map((f) => h('li', { className: `maker-check maker-check--${f.level}` }, [
      h('span', { className: 'maker-check__icon', text: LEVEL[f.level] }),
      h('span', { text: f.text }),
      ...(f.source ? [h('small', { text: ` · ${f.source}` })] : []),
    ]))),
    h('h2', { text: 'הנחיות ביצוע' }),
    h('ul', { className: 'maker-notes' }, [
      `קידוח System 32: שורת חורים במרחק ${STANDARDS.system32.setback} מ"מ מהקצה הקדמי (ומהאחורי), במרווחים של ${STANDARDS.system32.pitch} מ"מ, למדפים מתכווננים ולפרזול.`,
      `עובי דפנות ומדפים ${STANDARDS.panelThickness.min}–${STANDARDS.panelThickness.max} מ"מ; מדף ברוחב מעל ${cm(STANDARDS.longShelf.span)} ס"מ – ${STANDARDS.longShelf.minThickness}–${STANDARDS.longShelf.maxThickness} מ"מ או תמיכה מרכזית.`,
      `קנט ${STANDARDS.edgeBand.types} בעובי ${STANDARDS.edgeBand.thickness} מ"מ על כל הקצוות הגלויים.`,
      `צוקל (בסיס) בגובה ${cm(STANDARDS.plinth.min)}–${cm(STANDARDS.plinth.max)} ס"מ, מוגן מלחות.`,
      'עיגון הארון לקיר בשתי נקודות לפחות, בהתאם לסוג הקיר.',
      'כיוון צירים ומסילות לאחר ההרכבה, לפי הוראות היצרן.',
    ].map((text) => h('li', { text }))),
    h('h2', { text: 'מקורות לבדיקה' }),
    h('ul', { className: 'maker-sources' }, SOURCES.map((text) => h('li', { text }))),
    disclaimer(),
  ]);

  return [page1, page2, page3];
}
