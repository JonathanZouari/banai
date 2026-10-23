import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { clearHandleOps, doorMirrorOps, handleOps, modifyDoorOps } from '../../../src/editor/opsFromForm.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const apply = (ops, design = basic) => applyOps(design, ops, catalog);

describe('door and handle op builders', () => {
  it('builds modify_door ops for hinge side and mirror', () => {
    expect(modifyDoorOps('dr_left', { hingeSide: 'right' })).toEqual([{ op: 'modify_door', id: 'dr_left', hingeSide: 'right' }]);
    expect(doorMirrorOps('dr_left', true)).toEqual([{ op: 'modify_door', id: 'dr_left', mirror: true }]);
  });

  it('builds set_handles ops for the wardrobe, an item override and a reset', () => {
    expect(handleOps('all', { style: 'knob' })).toEqual([{ op: 'set_handles', target: 'all', style: 'knob' }]);
    expect(handleOps('dr_left', { finish: 'brass' })).toEqual([{ op: 'set_handles', target: 'dr_left', finish: 'brass' }]);
    expect(clearHandleOps('dr_left')).toEqual([{ op: 'set_handles', target: 'dr_left', clear: true }]);
  });

  it('applies: mirror and hinge change one door, overrides inherit and reset', () => {
    const mirrored = apply(doorMirrorOps('dr_middle', true));
    expect(mirrored.doors.items.map((d) => d.mirror)).toEqual([false, true, false]);
    const hinged = apply(modifyDoorOps('dr_left', { hingeSide: 'right' }));
    expect(hinged.doors.items[0].hingeSide).toBe('right');

    const wardrobe = apply(handleOps('all', { style: 'cup', finish: 'black' }));
    expect(wardrobe.handles).toEqual({ style: 'cup', finish: 'black' });
    const own = apply(handleOps('dr_left', { finish: 'brass' }), wardrobe);
    expect(own.doors.items[0].handle).toEqual({ style: 'cup', finish: 'brass' });
    expect(apply(clearHandleOps('dr_left'), own).doors.items[0].handle).toBeNull();
  });
});
