// The room around the wardrobe (schema v2 `site`). Estimates from the customer; the carpenter measures
// again on site. The ceiling is read at three points and the niche at three heights, as a carpenter measures
// [research 96][11]; the smallest known reading governs. The free floor in front of the wardrobe decides
// whether the doors and drawers have room to open. Together they switch on R1, R12, R21 and R22.
import { cmField, collapsibleSection, el } from './fields.js';
import { siteOps, siteReadingOps } from './interiorOps.js';
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
  return section;
}
