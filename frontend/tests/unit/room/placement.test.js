import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { FURNITURE } from '../../../src/room/catalog.js';
import { insideRoom, overlaps, wardrobeFootprint } from '../../../src/room/layout.js';
import { blocksView, doorwayEye, placeFurniture, PRESET_IDS, segmentHitsBox, wardrobeSamples } from '../../../src/room/placement.js';
import { ROOM_DEFAULTS } from '../../../src/room/roomState.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const make = (width, height, depth, count) => applyOps(null, [{ op: 'create_wardrobe', width, height, depth, compartmentCount: count }], catalog);
const DESIGNS = {
  basic: loadDesign('basic'),
  kids: make(1000, 1500, 500, 2),
  double: make(2200, 2400, 650, 2),
  minimal: make(1200, 2200, 600, 2),
  wide: make(3000, 2600, 650, 4),
};
const SIZES = [ROOM_DEFAULTS.size, { width: 3000, length: 3200, height: 2500 }, { width: 6000, length: 5500, height: 2800 }];
const room = (wardrobeAt, size) => ({ ...ROOM_DEFAULTS, enabled: true, wardrobeAt, size });

const cases = Object.entries(DESIGNS).flatMap(([name, design]) => ['left', 'centre', 'right'].flatMap((at) => SIZES.flatMap((size) => PRESET_IDS.map((preset) => ({ name, design, at, size, preset })))));

describe('furniture placement', () => {
  it(`never overlaps the wardrobe, the walls or other pieces, keeps the doorway clear and the wardrobe in view (${cases.length} rooms)`, () => {
    for (const { name, design, at, size, preset } of cases) {
      const label = `${name}/${at}/${size.width}x${size.length}/${preset}`;
      const { placed, box } = placeFurniture(design, room(at, size), preset);
      const eye = doorwayEye(box);
      const samples = wardrobeSamples(design);
      const doorway = { x0: box.door.x0, x1: box.door.x1, z0: box.zFront - 900, z1: box.zFront };
      for (const piece of placed) {
        const { underlay, height } = FURNITURE[piece.kind];
        expect(insideRoom(piece.rect, box), `${label} ${piece.id} inside`).toBe(true);
        expect(overlaps(piece.rect, wardrobeFootprint(design)), `${label} ${piece.id} wardrobe`).toBe(false);
        if (underlay) continue;
        expect(blocksView(piece.rect, height, eye, samples), `${label} ${piece.id} blocks the doorway view`).toBe(false);
        expect(overlaps(piece.rect, doorway), `${label} ${piece.id} doorway`).toBe(false);
        for (const other of placed) {
          if (other === piece || FURNITURE[other.kind].underlay) continue;
          const tucked = (piece.id === 'chair' && other.id === 'desk') || (piece.id === 'desk' && other.id === 'chair');
          if (!tucked) expect(overlaps(piece.rect, other.rect), `${label} ${piece.id} vs ${other.id}`).toBe(false);
        }
      }
    }
  });

  it('in the default room every style is complete for a standard and a small wardrobe', () => {
    for (const design of [DESIGNS.basic, DESIGNS.kids, DESIGNS.minimal]) {
      for (const preset of PRESET_IDS) {
        expect(placeFurniture(design, room('centre', ROOM_DEFAULTS.size), preset).omitted, preset).toEqual([]);
      }
    }
  });

  it('a too-small room leaves pieces out and says which, instead of forcing them in', () => {
    const { placed, omitted } = placeFurniture(DESIGNS.wide, room('centre', { width: 2000, length: 2000, height: 2700 }), 'teen');
    expect(omitted.length).toBeGreaterThan(0);
    expect(placed.length + omitted.length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic', () => {
    const a = placeFurniture(DESIGNS.basic, room('left', ROOM_DEFAULTS.size), 'kids');
    expect(placeFurniture(DESIGNS.basic, room('left', ROOM_DEFAULTS.size), 'kids')).toEqual(a);
  });

  it('segment against box: through, beside, and touching an edge', () => {
    const box = { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 };
    expect(segmentHitsBox({ x: -1, y: 0.5, z: 0.5 }, { x: 2, y: 0.5, z: 0.5 }, box)).toBe(true);
    expect(segmentHitsBox({ x: -1, y: 2, z: 0.5 }, { x: 2, y: 2, z: 0.5 }, box)).toBe(false);
    expect(segmentHitsBox({ x: -1, y: 0.5, z: 0.5 }, { x: -0.1, y: 0.5, z: 0.5 }, box)).toBe(false);
  });
});
