// The room panel's ops (editor/roomSection.js, ADR-037) and the proposal card's room line (state/diff.js).
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { sideGap } from '../../../src/domain/room.js';
import {
  addOpeningOps, newOpening, newRoomShape, removeOpeningOps, roomSizeOps, roomTemplateOps, updateOpeningOps,
} from '../../../src/editor/roomSection.js';
import { diffDesigns } from '../../../src/state/diff.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // 2000 x 2400 x 600
const apply = (design, ops) => applyOps(design, ops, catalog);

describe('the room panel', () => {
  it('makes each template around the wardrobe, and removes the room', () => {
    for (const kind of ['rect', 'l', 'recess']) {
      const design = apply(basic, roomTemplateOps(basic, kind));
      expect(design.room.shape.kind).toBe(kind);
      expect(roomTemplateOps(design, kind)).toBeNull(); // the same template again changes nothing
      expect(apply(design, roomTemplateOps(design, 'none')).room).toBeNull();
    }
    expect(roomTemplateOps(basic, 'none')).toBeNull();
  });

  it('a new niche leaves a filler each side of the wardrobe', () => {
    const design = apply(basic, roomTemplateOps(basic, 'recess'));
    expect(design.room).toMatchObject({ wall: 2, offset: 50 });
    expect(newRoomShape('recess', basic).recessWidth).toBe(2100);
    expect([sideGap(design, 'left'), sideGap(design, 'right')]).toEqual([50, 50]);
  });

  it('a size keeps the wall and the place along it', () => {
    const design = apply(basic, [{ op: 'set_room', shape: newRoomShape('rect', basic), wall: 1, offset: 300 }]);
    const wider = apply(design, roomSizeOps(design, 'depth', 4500));
    expect(wider.room).toMatchObject({ wall: 1, offset: 300, shape: { depth: 4500 } });
    expect(roomSizeOps(basic, 'width', 4000)).toBeNull();
  });

  it('a proposal that adds, changes or removes the room says so', () => {
    const room = apply(basic, roomTemplateOps(basic, 'rect'));
    expect(diffDesigns(basic, room)).toContain('חדר: נוסף');
    expect(diffDesigns(room, apply(room, [{ op: 'set_room', wall: 1 }]))).toContain('חדר: עודכן');
    expect(diffDesigns(room, basic)).toContain('חדר: הוסר');
  });
});

describe("the room's openings", () => {
  const room = apply(basic, roomTemplateOps(basic, 'rect')); // 3500 x 4000, the wardrobe on wall 0

  it('adds a door in the middle of the longest other wall, and removes it', () => {
    expect(newOpening(room)).toEqual({ type: 'door', wall: 1, at: 1550, width: 900, height: 2100 });
    const one = apply(room, addOpeningOps(room, newOpening(room)));
    expect(one.room.openings[0]).toMatchObject({ type: 'door', hinge: 'left', swing: 'in', sill: null });
    expect(apply(one, removeOpeningOps(one, 0)).room.openings).toEqual([]);
    expect(addOpeningOps(basic, newOpening(room))).toBeNull(); // no room, no openings
  });

  it('a new type takes its own fields and height, another wall keeps it inside', () => {
    const one = apply(room, addOpeningOps(room, newOpening(room)));
    const window_ = apply(one, updateOpeningOps(one, 0, { type: 'window' }));
    expect(window_.room.openings[0]).toMatchObject({ type: 'window', sill: 900, hinge: null, swing: null, height: 1200 });
    const passage = apply(window_, updateOpeningOps(window_, 0, { type: 'passage' }));
    expect(passage.room.openings[0]).toMatchObject({ sill: null, height: 2100 });
    const far = apply(one, updateOpeningOps(one, 0, { at: 3000 }));
    expect(apply(far, updateOpeningOps(far, 0, { wall: 0 })).room.openings[0]).toMatchObject({ wall: 0, at: 2600 });
    expect(updateOpeningOps(one, 3, { at: 0 })).toBeNull();
  });

  it('stops at eight', () => {
    let design = room;
    for (let i = 0; i < 8; i += 1) design = apply(design, addOpeningOps(design, { type: 'window', wall: 2, at: i * 400, width: 300, height: 300 }));
    expect(design.room.openings).toHaveLength(8);
    expect(addOpeningOps(design, newOpening(design))).toBeNull();
  });

  it('the proposal card names the openings apart from the room', () => {
    const one = apply(room, addOpeningOps(room, newOpening(room)));
    expect(diffDesigns(room, one)).toEqual(['פתחים בחדר: 0 ← 1']);
    expect(diffDesigns(one, apply(one, updateOpeningOps(one, 0, { at: 100 })))).toEqual(['פתחים בחדר: עודכנו']);
  });
});
