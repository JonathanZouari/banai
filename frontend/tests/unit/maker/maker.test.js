import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { checkDesign } from '../../../src/maker/checks.js';
import { cutList, describeAppearance, edgeBandMetres, hardwareList } from '../../../src/maker/cutList.js';
import { hingesFor, runnerLength } from '../../../src/maker/standards.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const levels = (findings, level) => findings.filter((f) => f.level === level).map((f) => f.text);

describe('standards helpers', () => {
  it('picks hinges by door height and runner length by depth', () => {
    expect(hingesFor(800)).toBe(2);
    expect(hingesFor(1500)).toBe(3);
    expect(hingesFor(2000)).toBe(4);
    expect(hingesFor(2360)).toBe(5);
    expect(runnerLength(594)).toBe(500);
    expect(runnerLength(40)).toBe(0);
  });
});

describe('checkDesign', () => {
  it('passes the basic wardrobe on depth and thickness, and always recommends a plinth and wall anchoring', () => {
    const findings = checkDesign(basic);
    expect(levels(findings, 'ok').some((t) => t.includes('עומק 60.0'))).toBe(true);
    expect(levels(findings, 'info').some((t) => t.includes('צוקל'))).toBe(true);
    expect(levels(findings, 'warn').some((t) => t.includes('לעגן לקיר'))).toBe(true);
    expect(findings[0].level).toBe('warn'); // warnings come first
  });

  it('warns about thin shelves wider than 80 cm', () => {
    const wide = applyOps(basic, [{ op: 'modify_compartment', compartmentId: 'cmp_left', width: 900 }], catalog);
    expect(levels(checkDesign(wide), 'warn').some((t) => t.includes('תא 1') && t.includes('24–28'))).toBe(true);
  });

  it('warns when sliding doors sit in a 60 cm deep wardrobe', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    expect(levels(checkDesign(sliding), 'warn').some((t) => t.includes('ארון הזזה'))).toBe(true);
  });

  it('classifies hanging space and warns when it is too short', () => {
    const findings = checkDesign(basic); // middle rail at 1900 with nothing below: long hanging
    expect(levels(findings, 'ok').some((t) => t.includes('תלייה ארוכה'))).toBe(true);
    const short = applyOps(basic, [{ op: 'add_shelf', compartmentId: 'cmp_middle', y: 1200 }], catalog);
    expect(levels(checkDesign(short), 'warn').some((t) => t.includes('מתחת למוט'))).toBe(true);
  });

  it('flags crowded shelves', () => {
    const crowded = applyOps(basic, [{ op: 'add_shelf', compartmentId: 'cmp_left', y: 600 }], catalog);
    expect(levels(checkDesign(crowded), 'warn').some((t) => t.includes('צפוף'))).toBe(true);
  });
});

describe('cutList', () => {
  const parts = cutList(basic, catalog);
  const find = (prefix) => parts.filter((p) => p.name.startsWith(prefix));

  it('lists the carcass parts with their real sizes', () => {
    expect(find('דופן צד')).toEqual([expect.objectContaining({ quantity: 2, length: 2400, width: 600, thickness: 18 })]);
    expect(find('תקרה')).toEqual([expect.objectContaining({ quantity: 2, length: 1964, width: 600 })]);
    expect(find('מחיצה')).toHaveLength(2);
    expect(find('מחיצה')[0]).toMatchObject({ length: 2364, width: 594 });
  });

  it('groups shelves per compartment and lists drawer fronts and doors', () => {
    expect(find('מדף – תא 1')).toEqual([expect.objectContaining({ quantity: 4, length: 643, width: 594, thickness: 18 })]);
    expect(find('חזית מגירה')).toHaveLength(2);
    expect(find('חזית מגירה')[0]).toMatchObject({ length: 636, width: 194 }); // right compartment is 642 wide
    expect(find('דלת')).toHaveLength(3);
    expect(find('דלת')[0]).toMatchObject({ length: 2360, width: 639, edges: 4 });
  });

  it('names catalog materials in Hebrew', () => {
    expect(describeAppearance(basic.carcass.appearance, catalog)).toBe('מלמין · לבן · מט');
    expect(find('דופן צד')[0].finish).toBe('מלמין · לבן · מט');
  });

  it('adds up edge banding', () => {
    expect(edgeBandMetres(parts)).toBeGreaterThan(30);
    expect(edgeBandMetres([{ quantity: 1, length: 1000, width: 500, edges: 4 }])).toBe(3);
  });
});

describe('hardwareList', () => {
  it('counts hinges, runners, rail parts and shelf pins for the basic wardrobe', () => {
    const items = hardwareList(basic);
    const qty = (text) => items.find((i) => i.name.includes(text))?.quantity;
    expect(qty('ציר נסתר')).toBe(15); // 3 doors × 5
    expect(qty('מסילות מגירה')).toBe(2);
    expect(items.find((i) => i.name.includes('מסילות מגירה')).name).toContain('50 ס"מ');
    expect(items.find((i) => i.name.includes('צינור תלייה')).name).toContain('64.3');
    expect(qty('תושבת')).toBe(2);
    expect(qty('תומכי מדף')).toBe(7 * 4);
    expect(qty('עיגון')).toBe(2);
  });

  it('lists a sliding track set instead of hinges for sliding doors', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    const names = hardwareList(sliding).map((i) => i.name).join('\n');
    expect(names).toContain('מסילות הזזה');
    expect(names).not.toContain('ציר נסתר');
  });
});
