import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  addCompartmentOps, addItemOps, doorHingeOps, doorTypeOps, friendlyError, LAYOUTS, layoutOps, materialOps, parseCm, toCmText,
} from '../../../src/editor/opsFromForm.js';
import { DomainError } from '../../../src/domain/errors.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');

describe('parseCm', () => {
  it('converts centimetres (1 decimal) to integer millimetres', () => {
    expect(parseCm('64.3')).toEqual({ ok: true, mm: 643 });
    expect(parseCm(' 200 ')).toEqual({ ok: true, mm: 2000 });
    expect(parseCm('64,35')).toEqual({ ok: true, mm: 644 });
  });

  it('rejects empty, non-numeric and absurd input', () => {
    for (const text of ['', '   ', 'abc', '12cm', 'Infinity', '1e9', '--5']) {
      expect(parseCm(text).ok).toBe(false);
    }
  });

  it('formats millimetres back to centimetres', () => {
    expect(toCmText(643)).toBe('64.3');
    expect(toCmText(2000)).toBe('200.0');
  });
});

describe('door and material ops', () => {
  it('maps door types to configure_doors', () => {
    expect(doorTypeOps('hinged')).toEqual([{ op: 'configure_doors', type: 'hinged' }]);
    expect(doorTypeOps('sliding', 3)).toEqual([{ op: 'configure_doors', type: 'sliding', count: 3 }]);
    expect(doorTypeOps('none')).toEqual([{ op: 'configure_doors', type: 'none' }]);
  });

  it('changes one hinge side while keeping every other door', () => {
    const ops = doorHingeOps(basic, 'dr_middle', 'left');
    const result = applyOps(basic, ops, catalog);
    expect(result.doors.items.map((d) => [d.id, d.hingeSide])).toEqual([
      ['dr_left', 'left'], ['dr_middle', 'left'], ['dr_right', 'left'],
    ]);
  });

  it('builds catalog and custom appearance refs', () => {
    expect(materialOps('carcass', 'color', { catalogId: 'walnut' }))
      .toEqual([{ op: 'set_material', target: 'carcass', color: { catalogId: 'walnut' } }]);
    expect(materialOps('shf_l1', 'color', { custom: true, name: 'Sage', hex: '#9caf88' }))
      .toEqual([{ op: 'set_material', target: 'shf_l1', color: { custom: true, name: 'Sage', hex: '#9caf88' } }]);
  });
});

describe('structure ops produce valid designs', () => {
  it('adds a compartment by splitting space from the last one', () => {
    const result = applyOps(basic, addCompartmentOps(basic), catalog);
    expect(result.compartments).toHaveLength(4);
  });

  it.each(['shelf', 'drawer', 'rail'])('adds a %s into free space of every compartment', (kind) => {
    for (const compartment of basic.compartments) {
      const result = applyOps(basic, addItemOps(basic, compartment.id, kind), catalog);
      const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
      const after = result.compartments.find((c) => c.id === compartment.id)[key].length;
      expect(after).toBe(compartment[key].length + 1);
    }
  });
});

describe('friendlyError', () => {
  it('turns domain errors into short user messages', () => {
    expect(friendlyError(new DomainError('OVERLAP', 'compartments[0].shelves[4]', 'x'))).toMatch(/overlap/i);
    expect(friendlyError(new DomainError('OUT_OF_BOUNDS', 'x', 'x'))).toMatch(/inside the wardrobe/i);
    expect(friendlyError(new DomainError('OUT_OF_RANGE', 'ops[0].width', 'x'))).toMatch(/allowed range/i);
    expect(friendlyError(new DomainError('SOMETHING_NEW', 'x', 'x'))).toMatch(/could not be applied/i);
  });
});

describe('layoutOps', () => {
  const contents = (design, id) => {
    const c = design.compartments.find((x) => x.id === id);
    return { shelves: c.shelves.length, drawers: c.drawers.length, rails: c.rails.length };
  };

  it('replaces every compartment\'s contents with each layout, and the result is valid', () => {
    for (const compartment of basic.compartments) {
      for (const layout of LAYOUTS) {
        const result = applyOps(basic, layoutOps(basic, compartment.id, layout), catalog);
        const others = basic.compartments.filter((c) => c.id !== compartment.id);
        others.forEach((other) => expect(result.compartments.find((c) => c.id === other.id)).toEqual(other));
        const old = [...compartment.shelves, ...compartment.drawers, ...compartment.rails].map((item) => item.id);
        const now = result.compartments.find((c) => c.id === compartment.id);
        old.forEach((id) => expect(JSON.stringify(now)).not.toContain(id));
      }
    }
  });

  it('builds the expected layouts for a 2400 mm wardrobe', () => {
    const hanging = applyOps(basic, layoutOps(basic, 'cmp_left', 'hanging'), catalog);
    expect(contents(hanging, 'cmp_left')).toEqual({ shelves: 1, drawers: 0, rails: 1 });
    const left = hanging.compartments[0];
    expect(left.rails[0].y).toBeLessThan(left.shelves[0].y); // the rail hangs under the shelf
    expect(contents(applyOps(basic, layoutOps(basic, 'cmp_left', 'shelves'), catalog), 'cmp_left')).toEqual({ shelves: 5, drawers: 0, rails: 0 });
    const drawers = applyOps(basic, layoutOps(basic, 'cmp_left', 'drawers'), catalog);
    expect(contents(drawers, 'cmp_left')).toEqual({ shelves: 4, drawers: 3, rails: 0 });
    expect(drawers.compartments[0].drawers.map((d) => d.y)).toEqual([0, 200, 400]);
  });

  it('still fits a very low wardrobe', () => {
    const empty = basic.compartments.flatMap((c) => [...c.shelves, ...c.drawers, ...c.rails].map((item) => ({ op: 'remove_component', id: item.id })));
    const low = applyOps(basic, [...empty, { op: 'update_dimensions', height: 400 }], catalog);
    for (const layout of LAYOUTS) expect(() => applyOps(low, layoutOps(low, 'cmp_left', layout), catalog)).not.toThrow();
  });

  it('ignores unknown compartments and layouts', () => {
    expect(layoutOps(basic, 'cmp_nope', 'shelves')).toEqual([]);
    expect(layoutOps(basic, 'cmp_left', 'disco')).toEqual([]);
  });
});

describe('curated colours', () => {
  it('parses colour kind and materials, with safe defaults, and rejects unknown materials', async () => {
    const { parseCatalog } = await import('../../../src/domain/catalog.js');
    const parsed = parseCatalog(catalog);
    expect(parsed.colors.find((c) => c.id === 'walnut')).toMatchObject({ kind: 'wood', materials: ['melamine', 'walnut_veneer'] });
    const legacy = parseCatalog({ ...catalog, colors: [{ id: 'white', name: 'White', hex: '#ffffff' }] });
    expect(legacy.colors[0]).toMatchObject({ kind: 'solid', materials: [] });
    expect(() => parseCatalog({ ...catalog, colors: [{ id: 'x', name: 'X', hex: '#000000', materials: ['marble'] }] })).toThrow();
    expect(() => parseCatalog({ ...catalog, colors: [{ id: 'x', name: 'X', hex: '#000000', kind: 'neon' }] })).toThrow();
  });

  it('lists only the colours a material is offered in', async () => {
    const { coloursFor, parseCatalog } = await import('../../../src/domain/catalog.js');
    const parsed = parseCatalog(catalog);
    expect(coloursFor(parsed, 'oak_veneer').map((c) => c.id)).toEqual(['natural_oak', 'whitewashed_oak', 'smoked_oak']);
    expect(coloursFor(parsed, 'lacquered_mdf').map((c) => c.id)).toContain('sage');
    expect(coloursFor(parsed, 'melamine').map((c) => c.id)).not.toContain('sage');
  });

  it('a material change keeps an offered colour, otherwise picks the first offered one', async () => {
    const { parseCatalog } = await import('../../../src/domain/catalog.js');
    const { materialChangeOps } = await import('../../../src/editor/appearanceControls.js');
    const parsed = parseCatalog(catalog);
    const white = basic.carcass.appearance;
    expect(materialChangeOps(parsed, white, 'carcass', 'lacquered_mdf')).toEqual([{ op: 'set_material', target: 'carcass', material: { catalogId: 'lacquered_mdf' } }]);
    const [op] = materialChangeOps(parsed, white, 'carcass', 'oak_veneer');
    expect(op).toEqual({ op: 'set_material', target: 'carcass', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'natural_oak' } });
    expect(applyOps(basic, [op], catalog).carcass.appearance.color).toEqual({ catalogId: 'natural_oak' });
    const custom = { ...white, color: { custom: true, name: 'Sage', hex: '#9caf88' } };
    expect(materialChangeOps(parsed, custom, 'doors', 'walnut_veneer')[0].color).toEqual({ catalogId: 'walnut' });
  });
});

describe('door op builders', () => {
  it('a new sliding-panel count keeps the existing panels and their mirror fronts', async () => {
    const { slidingCountOps } = await import('../../../src/editor/opsFromForm.js');
    const sliding = applyOps(basic, [
      { op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] },
      { op: 'modify_door', id: 'dr_b', front: 'mirror' },
    ], catalog);
    const three = applyOps(sliding, slidingCountOps(sliding, 3), catalog);
    expect(three.doors.items.map((d) => d.id).slice(0, 2)).toEqual(['dr_a', 'dr_b']);
    expect(three.doors.items.map((d) => d.front)).toEqual(['panel', 'mirror', 'panel']);
    const one = applyOps(three, slidingCountOps(three, 1), catalog);
    expect(one.doors.items.map((d) => d.id)).toEqual(['dr_a']);
  });

  it('builds handle and door-front ops', async () => {
    const { doorFrontOps, handleOps } = await import('../../../src/editor/opsFromForm.js');
    expect(handleOps('style', 'knob')).toEqual([{ op: 'set_handles', style: 'knob' }]);
    expect(doorFrontOps('dr_left', 'mirror')).toEqual([{ op: 'modify_door', id: 'dr_left', front: 'mirror' }]);
    expect(applyOps(basic, doorFrontOps('dr_left', 'mirror'), catalog).doors.items[0].front).toBe('mirror');
  });

  it('a hinge change keeps the door\'s mirror front and its own finish', () => {
    const styled = applyOps(basic, [
      { op: 'modify_door', id: 'dr_left', front: 'mirror' },
      { op: 'set_material', target: 'dr_left', color: { catalogId: 'walnut' } },
    ], catalog);
    const flipped = applyOps(styled, doorHingeOps(styled, 'dr_left', 'right'), catalog);
    expect(flipped.doors.items[0]).toMatchObject({ hingeSide: 'right', front: 'mirror', appearance: { color: { catalogId: 'walnut' } } });
  });
});
