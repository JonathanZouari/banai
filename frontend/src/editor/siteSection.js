// The room around the wardrobe (schema v2 `site`). Estimates from the customer; the carpenter measures
// again on site. The ceiling is read at three points and the niche at three heights, as a carpenter measures
// [research 96][11]; the smallest known reading governs. The free floor in front of the wardrobe decides
// whether the doors and drawers have room to open. Together they switch on R1, R12, R21 and R22.
import { actionResult, button, cmField, collapsibleSection, el, selectField } from './fields.js';
import {
  MAX_PANEL_OBSTACLES, OBSTACLE_OPTIONS, addObstacleOps, newObstacle, removeObstacleOps, siteOps, siteReadingOps, updateObstacleOps,
} from './interiorOps.js';
import { toCmText } from './opsFromForm.js';

export const READINGS = Object.freeze([
  Object.freeze({ kind: 'heights', single: 'ceiling', title: 'גובה התקרה', hint: 'בשלוש נקודות. הנמוכה קובעת.', labels: ['שמאל', 'אמצע', 'ימין'], testId: 'site-height' }),
  Object.freeze({ kind: 'widths', single: 'niche', title: 'רוחב הנישה', hint: 'בשלושה גבהים. הקטן קובע.', labels: ['למעלה', 'באמצע', 'למטה'], testId: 'site-width' }),
]);

/** The line under a reading group: what governs, or how to measure. */
export function readingNote(site, { kind, single, hint }) {
  const value = site?.[single] ?? null;
  if (value === null) return hint;
  if (!site?.[kind]) return `מדידה אחת: ${toCmText(value)} ס״מ. אפשר להוסיף שלוש מדידות.`;
  return `קובע: ${toCmText(value)} ס״מ`;
}

export function siteSection({ design, run, current = () => design }) {
  const { site } = design;
  const now = () => current().site; // the site at commit time: three quick entries must not drop one
  const commit = (ops) => (ops ? run(ops) : { ok: true }); // nothing to clear is not an error
  const section = collapsibleSection('site', 'המרחב', [
    el('p', { className: 'panel__note', text: 'מידות משוערות. הנגר מאמת אותן באתר. שדה ריק = לא ידוע.' }),
  ]);
  READINGS.forEach((group) => {
    const fields = group.labels.map((label, i) => cmField({
      label, testId: `${group.testId}-${i}`, optional: true, mm: site?.[group.kind]?.[i] ?? null,
      onCommit: (mm) => commit(siteReadingOps(now(), group.kind, i, mm)),
    }));
    const box = el('div', { className: 'site-readings', attrs: { role: 'group', 'aria-label': group.title } }, [
      el('p', { className: 'site-readings__title', text: group.title }),
      // Heights are read left, middle, right on the wall: the fields keep that physical order, also in RTL.
      el('div', { className: 'site-readings__row', attrs: { 'data-kind': group.kind } }, fields),
      el('p', { className: 'panel__note site-readings__note', text: readingNote(site, group) }),
    ]);
    box.dataset.testid = `${group.testId}s`;
    section.append(box);
  });
  section.append(
    cmField({
      label: 'מרחב פנוי מול הארון', testId: 'site-clearance', optional: true, mm: site?.clearance ?? null,
      onCommit: (mm) => commit(siteOps(now(), 'clearance', mm)),
    }),
    el('p', { className: 'panel__note', text: 'מחזית הארון עד הקיר או הרהיט שמולו. קובע אם יש מקום לפתוח דלתות ומגירות.' }),
  );
  section.append(obstaclesBox({ design, run, now }));
  return section;
}

// Each obstacle field: label, key, and whether an empty entry is allowed (never: every field is a measurement).
const OBSTACLE_FIELDS = Object.freeze([
  { key: 'x', label: 'מקצה הארון השמאלי' },
  { key: 'y', label: 'גובה מהרצפה' },
  { key: 'width', label: 'רוחב' },
  { key: 'height', label: 'גובה' },
]);

/** What is on the wall behind the wardrobe: sockets, switches, an AC unit, pipes, a window, skirting. */
function obstaclesBox({ design, run, now }) {
  const list = design.site?.obstacles ?? [];
  const box = el('div', { className: 'site-obstacles', attrs: { role: 'group', 'aria-label': 'מכשולים בקיר' } }, [
    el('p', { className: 'site-readings__title', text: 'מכשולים בקיר' }),
    el('p', { className: 'panel__note', text: 'שקעים, מתגים, מזגן, צנרת, חלון או פנל על הקיר שמאחורי הארון. המרחק נמדד מהקצה השמאלי של הארון (שלילי = משמאל לו).' }),
  ]);
  box.dataset.testid = 'site-obstacles';
  list.forEach((item, index) => {
    const row = el('div', { className: 'site-obstacle' });
    row.dataset.testid = `obstacle-${index}`;
    const kind = selectField({
      label: `מכשול ${index + 1}`, options: OBSTACLE_OPTIONS, value: item.type, testId: `obstacle-${index}-type`,
      onChange: (type) => actionResult(row, commitOps(run, updateObstacleOps(now(), index, { type }))),
    });
    const fields = OBSTACLE_FIELDS.map(({ key, label }) => cmField({
      label, testId: `obstacle-${index}-${key}`, mm: item[key],
      onCommit: (mm) => (mm === null ? { ok: true } : commitOps(run, updateObstacleOps(now(), index, { [key]: mm }))),
    }));
    const remove = button('הסרה', () => actionResult(row, commitOps(run, removeObstacleOps(now(), index))), {
      variant: 'link', testId: `obstacle-${index}-remove`,
    });
    row.append(el('div', { className: 'site-obstacle__head' }, [kind, remove]), el('div', { className: 'site-obstacle__grid' }, fields));
    box.append(row);
  });
  box.append(button('+ הוספת מכשול', () => actionResult(box, commitOps(run, addObstacleOps(now(), newObstacle(design)))), {
    variant: 'secondary', testId: 'add-obstacle', disabled: list.length >= MAX_PANEL_OBSTACLES,
  }));
  return box;
}

const commitOps = (run, ops) => (ops ? run(ops) : { ok: true });
