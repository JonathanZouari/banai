// Human-readable differences between two designs. Shared by version compare and AI proposals,
// so the user always sees changes described the same way.
import { PRESETS, INSERTS, decorById, cm } from './model.js';

const DOOR = { hinged: 'ציר', sliding: 'הזזה', none: 'ללא' };
const HANDLE = { bar: 'מוט', edge: 'פרופיל', none: 'לחיצה' };
const preset = (id) => PRESETS.find((p) => p.id === id)?.name ?? id;
const insert = (id) => INSERTS.find((d) => d.id === id)?.name ?? id;

export function diff(a, b) {
  const out = [];
  const dim = (label, x, y) => { if (x !== y) out.push(`${label}: ${cm(x)} ← ${cm(y)} ס״מ`); };
  dim('רוחב', a.body.width, b.body.width);
  dim('גובה', a.body.height, b.body.height);
  dim('עומק', a.body.depth, b.body.depth);
  dim('תקרה', a.site.ceiling, b.site.ceiling);
  dim('נישה', a.site.niche, b.site.niche);
  if (a.doors.type !== b.doors.type) out.push(`דלתות: ${DOOR[a.doors.type]} ← ${DOOR[b.doors.type]}`);
  if (a.doors.handle !== b.doors.handle) out.push(`ידית: ${HANDLE[a.doors.handle]} ← ${HANDLE[b.doors.handle]}`);
  if (a.doors.mirror !== b.doors.mirror) out.push(b.doors.mirror ? 'נוספה מראה בדלת המרכזית' : 'הוסרה המראה');
  if (a.decor.body !== b.decor.body) out.push(`גוף: ${decorById(a.decor.body).name} ← ${decorById(b.decor.body).name}`);
  if (a.decor.front !== b.decor.front) out.push(`חזיתות: ${decorById(a.decor.front).name} ← ${decorById(b.decor.front).name}`);
  if (a.compartments.length !== b.compartments.length) out.push(`תאים: ${a.compartments.length} ← ${b.compartments.length}`);
  b.compartments.forEach((c, i) => {
    const o = a.compartments[i];
    if (!o) { out.push(`תא ${i + 1} (חדש): ${[preset(c.preset), ...(c.inserts ?? []).map(insert)].join(' + ')}`); return; }
    if (o.preset !== c.preset) out.push(`תא ${i + 1}: ${preset(o.preset)} ← ${preset(c.preset)}`);
    if (o.split !== c.split) out.push(`תא ${i + 1}: ${c.split ? 'שתי דלתות' : 'דלת אחת'}`);
    const before = new Set(o.inserts ?? []);
    const after = new Set(c.inserts ?? []);
    for (const id of after) if (!before.has(id)) out.push(`תא ${i + 1}: + ${insert(id)}`);
    for (const id of before) if (!after.has(id)) out.push(`תא ${i + 1}: − ${insert(id)}`);
  });
  return out;
}
