import { describe, expect, it } from 'vitest';
import { CATALOG_NAMES_HE } from '../../../src/chat/diffStrings.js';
import { cmShort, describeChange, groupLabel, refName } from '../../../src/chat/diffText.js';
import { proposalChanges } from '../../../src/domain/diff.js';
import { deepFreeze } from '../../../src/domain/util.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const design = deepFreeze(loadDesign('basic'));
const texts = (ops, language) => proposalChanges(design, ops, catalog).map((c) => describeChange(c, language, catalog));

describe('cmShort', () => {
  it('drops a trailing .0 and keeps a meaningful decimal', () => {
    expect([2000, 643, 0, 18, 25].map(cmShort)).toEqual(['200', '64.3', '0', '1.8', '2.5']);
  });
});

describe('describeChange', () => {
  it('a dimension change shows the unit once, and says both units aloud', () => {
    const [en] = texts([{ op: 'update_dimensions', width: 2400 }], 'en');
    expect(en).toEqual({ label: 'Width', before: '200', after: '240 cm', spoken: 'Width changes from 200 cm to 240 cm' });
    const [he] = texts([{ op: 'update_dimensions', width: 2400 }], 'he');
    expect(he).toEqual({ label: 'רוחב', before: '200', after: '240 ס״מ', spoken: 'הרוחב משתנה מ־200 ס״מ ל־240 ס״מ' });
  });

  it('a compartment width names the compartment in the sentence', () => {
    const [, en] = texts([{ op: 'update_dimensions', width: 2400 }], 'en');
    expect(en.spoken).toMatch(/^Compartment 1 width changes from 64\.3 cm to \d+(\.\d)? cm$/);
    const [, he] = texts([{ op: 'update_dimensions', width: 2400 }], 'he');
    expect(he.spoken).toMatch(/^הרוחב של תא 1 משתנה מ־64\.3 ס״מ ל־/);
  });

  it('added parts: "+2 shelves" with their heights', () => {
    const ops = [
      { op: 'add_shelf', compartmentId: 'cmp_middle', y: 800, id: 'shf_n1' },
      { op: 'add_shelf', compartmentId: 'cmp_middle', y: 1200, id: 'shf_n2' },
    ];
    expect(texts(ops, 'en')).toEqual([{ label: '+2 shelves', detail: 'at 80 · 120 cm', spoken: '2 shelves added in compartment 2, at 80 cm and at 120 cm' }]);
    expect(texts(ops, 'he')).toEqual([{ label: '+2 מדפים', detail: 'בגובה 80 · 120 ס״מ', spoken: 'נוספו 2 מדפים בתא 2, בגובה 80 ס״מ ובגובה 120 ס״מ' }]);
  });

  it('one added part reads naturally, and the verb agrees in Hebrew', () => {
    const ops = [{ op: 'add_rail', compartmentId: 'cmp_left', y: 1900, id: 'rail_n1' }];
    expect(texts(ops, 'en')[0].label).toBe('Hanging rail added');
    expect(texts(ops, 'he')[0]).toMatchObject({ label: 'מוט תלייה נוסף', spoken: 'מוט תלייה נוסף בתא 1, בגובה 190 ס״מ' });
  });

  it('a removed part at height 0 is "at the bottom"', () => {
    const ops = [{ op: 'remove_component', id: 'drw_r1' }];
    expect(texts(ops, 'en')).toEqual([{ label: 'Drawer removed', detail: 'at the bottom', spoken: 'Drawer removed from compartment 3, at the bottom' }]);
    expect(texts(ops, 'he')).toEqual([{ label: 'מגירה הוסרה', detail: 'בתחתית', spoken: 'מגירה הוסרה מתא 3, בתחתית' }]);
  });

  it('a moved part', () => {
    const ops = [{ op: 'modify_rail', id: 'rail_m1', y: 1750 }];
    expect(texts(ops, 'en')).toEqual([{ label: 'Hanging rail', before: '190', after: '175 cm', spoken: 'Hanging rail in compartment 2 moves from 190 cm to 175 cm' }]);
    expect(texts(ops, 'he')[0].spoken).toBe('מוט תלייה בתא 2 זז מגובה 190 ס״מ לגובה 175 ס״מ');
  });

  it('materials and colours by name, in the card language', () => {
    const ops = [
      { op: 'set_material', target: 'carcass', material: { catalogId: 'oak_veneer' } },
      { op: 'set_material', target: 'dr_middle', color: { catalogId: 'natural_oak' } },
    ];
    expect(texts(ops, 'en')).toEqual([
      { label: 'Material', before: 'Melamine board', after: 'Oak veneer', spoken: 'Wardrobe body material changes from Melamine board to Oak veneer' },
      { label: 'Door 2 colour', before: 'White', after: 'Natural oak', spoken: 'Door 2 colour changes from White to Natural oak' },
    ]);
    expect(texts(ops, 'he')).toEqual([
      { label: 'חומר', before: 'לוח מלמין', after: 'פורניר אלון', spoken: 'החומר של גוף הארון משתנה מלוח מלמין לפורניר אלון' },
      { label: 'צבע · דלת 2', before: 'לבן', after: 'אלון טבעי', spoken: 'הצבע של דלת 2 משתנה מלבן לאלון טבעי' },
    ]);
  });

  it('an added compartment', () => {
    const ops = [{ op: 'add_compartment', position: 0, width: 400, id: 'cmp_new' }];
    expect(texts(ops, 'en')[0]).toEqual({ label: 'Compartment 1 added', detail: '40 cm wide', spoken: 'Compartment 1 added, 40 cm wide' });
    expect(texts(ops, 'he')[0]).toEqual({ label: 'תא 1 נוסף', detail: 'ברוחב 40 ס״מ', spoken: 'תא 1 נוסף, ברוחב 40 ס״מ' });
  });

  it('doors: type, count and hinge', () => {
    const sliding = texts([{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }], 'en');
    expect(sliding.map((t) => t.spoken)).toEqual(['Door type changes from Hinged to Sliding', 'Number of doors changes from 3 to 2']);
    const hinge = texts([{ op: 'configure_doors', type: 'hinged', doors: [
      { id: 'dr_left', compartmentIds: ['cmp_left'], hingeSide: 'right' },
      { id: 'dr_middle', compartmentIds: ['cmp_middle'], hingeSide: 'right' },
      { id: 'dr_right', compartmentIds: ['cmp_right'], hingeSide: 'left' },
    ] }], 'he');
    expect(hinge).toEqual([{ label: 'ציר · דלת 1', before: 'שמאל', after: 'ימין', spoken: 'הציר של דלת 1 משתנה משמאל לימין' }]);
  });

  it('screen-reader sentences never rely on arrows or signs', () => {
    const ops = [
      { op: 'update_dimensions', depth: 550 },
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 200, id: 'shf_n1' },
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 1800, id: 'shf_n2' },
      { op: 'remove_component', id: 'drw_r2' },
    ];
    ['en', 'he'].forEach((language) => texts(ops, language).forEach(({ spoken }) => expect(spoken).not.toMatch(/[→←+−]/)));
  });
});

describe('names and numbering', () => {
  it('a custom value is labelled as custom', () => {
    expect(refName({ custom: true, name: 'Sage', hex: null }, 'color', 'en', catalog)).toBe('Custom: Sage');
    expect(refName({ custom: true, name: 'Sage', hex: null }, 'color', 'he', catalog)).toBe('מותאם אישית: Sage');
  });

  it('every catalog value has a Hebrew name', () => {
    const ids = [...catalog.materials, ...catalog.colors, ...catalog.finishes].map((e) => e.id);
    expect(ids.filter((id) => !CATALOG_NAMES_HE[id])).toEqual([]);
  });

  it('"תא 2" is the same compartment as "Compartment 2" (no RTL reversal)', () => {
    expect(groupLabel({ kind: 'compartment', index: 2 }, 'he')).toBe('תא 2');
    expect(groupLabel({ kind: 'compartment', index: 2 }, 'en')).toBe('Compartment 2');
  });
});
