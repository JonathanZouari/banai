import { afterEach, describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { rangeCm, STEPS, stepSummaries } from '../../../src/editor/steps.js';
import { setUiLanguage } from '../../../src/ui/i18n.js';
import { plainText } from '../../../src/ui/bidi.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');

afterEach(() => setUiLanguage('he'));

describe('panel steps', () => {
  it('are the five steps in order', () => {
    expect(STEPS).toEqual(['dimensions', 'doors', 'interior', 'materials', 'notes']);
  });

  it('summarise the basic wardrobe in Hebrew', () => {
    const s = stepSummaries(basic, catalog, '');
    expect(plainText(s.dimensions)).toBe('200.0 × 240.0 × 60.0 ס״מ');
    expect(s.dimensions).not.toBe(plainText(s.dimensions)); // the numbers are isolated as one LTR run
    expect(s.doors).toBe('צירים · 3 דלתות');
    expect(s.interior).toMatch(/^3 תאים · \d+ מדפים · מוט תלייה אחד · \d+ מגירות$/);
    expect(s.materials).toBe('לוח מלמין · לבן · מט');
    expect(s.notes).toBe('אין הערות');
  });

  it('follow the design: sliding doors, no doors, a custom colour', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    expect(stepSummaries(sliding, catalog).doors).toBe('הזזה · 2 כנפיים');
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(stepSummaries(none, catalog).doors).toBe('ללא דלתות');
    const custom = applyOps(basic, [{ op: 'set_material', target: 'carcass', color: { custom: true, name: 'ירוק מרווה', hex: '#9caf88' } }], catalog);
    expect(stepSummaries(custom, catalog).materials).toBe('לוח מלמין · ירוק מרווה · מט');
  });

  it('shorten long notes to one line', () => {
    expect(stepSummaries(basic, catalog, '  ידיות\n שחורות  ').notes).toBe('ידיות שחורות');
    expect(stepSummaries(basic, catalog, 'א'.repeat(60)).notes).toBe(`${'א'.repeat(40)}…`);
  });

  it('switch to English with the UI', () => {
    setUiLanguage('en');
    const s = stepSummaries(basic, catalog, '');
    expect(plainText(s.dimensions)).toBe('200.0 × 240.0 × 60.0 cm');
    expect(s.doors).toBe('Hinged · 3 doors');
    expect(s.materials).toBe('Melamine board · White · Matte');
  });

  it('show the documented dimension ranges in whole centimetres', () => {
    expect(rangeCm('width')).toEqual(['30', '600']);
    expect(rangeCm('height')).toEqual(['30', '350']);
    expect(rangeCm('depth')).toEqual(['20', '120']);
  });
});
