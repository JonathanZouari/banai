// The room panel's ops (editor/roomSection.js, ADR-037) and the proposal card's room line (state/diff.js).
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { sideGap } from '../../../src/domain/room.js';
import { newRoomShape, roomSizeOps, roomTemplateOps } from '../../../src/editor/roomSection.js';
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
