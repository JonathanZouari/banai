// The room around the wardrobe (schema v2 `site`). Estimates from the customer; the carpenter
// measures again on site. They switch on the ceiling-lift and niche advisories.
import { cmField, collapsibleSection, el } from './fields.js';
import { siteOps } from './interiorOps.js';

const FIELDS = Object.freeze([
  { field: 'ceiling', label: 'גובה התקרה', testId: 'site-ceiling' },
  { field: 'niche', label: 'רוחב הנישה (הקטן מבין שלוש מדידות)', testId: 'site-niche' },
]);

export function siteSection({ design, run }) {
  const { site } = design;
  const section = collapsibleSection('site', 'המרחב', [
    el('p', { className: 'panel__note', text: 'מידות משוערות. הנגר מאמת אותן באתר. שדה ריק = לא ידוע.' }),
  ]);
  FIELDS.forEach(({ field, label, testId }) => section.append(cmField({
    label, testId, optional: true, mm: site?.[field] ?? null,
    onCommit: (mm) => run(siteOps(site, field, mm)),
  })));
  return section;
}
