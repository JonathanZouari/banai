// Wall obstacles and the scale figure (ADR-031): the panel's ops, the pencil outlines (R23's "behind" test
// in the viewer) and the figure's proportions and placement.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  MAX_PANEL_OBSTACLES, addObstacleOps, newObstacle, removeObstacleOps, updateObstacleOps,
} from '../../../src/editor/interiorOps.js';
import { FIGURE_HEIGHT, FIGURE_PARTS, createFigure, figurePlacement, figureSpots } from '../../../src/viewer/figure.js';
import { buildFurniture } from '../../../src/viewer/furniture3d.js';
import { createRoomOverlay, obstacleOutlines } from '../../../src/viewer/room.js';
import { diffDesigns } from '../../../src/state/diff.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';
import { validateDesign } from '../../../src/domain/validation.js';
import { buildObstacles } from '../../../src/viewer/obstacles3d.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // W 2000, H 2400
const apply = (design, ops) => applyOps(design, ops, catalog);

describe('wall obstacle ops', () => {
  it('adds, changes and removes one obstacle at a time; the last removal clears the list', () => {
    const one = apply(basic, addObstacleOps(basic.site, newObstacle(basic)));
    expect(one.site.obstacles).toEqual([{ type: 'socket', x: 960, y: 300, width: 80, height: 80, name: null }]);
    const ac = apply(one, updateObstacleOps(one.site, 0, { type: 'ac', y: 2100, width: 900 }));
    expect(ac.site.obstacles[0]).toEqual({ type: 'ac', x: 960, y: 2100, width: 900, height: 80, name: null });
    const two = apply(ac, addObstacleOps(ac.site, newObstacle(ac)));
    expect(two.site.obstacles).toHaveLength(2);
    const back = apply(two, removeObstacleOps(two.site, 0));
    expect(back.site.obstacles.map((o) => o.type)).toEqual(['socket']);
    expect(apply(back, removeObstacleOps(back.site, 0)).site).toBeNull();
    expect(updateObstacleOps(back.site, 5, { y: 1 })).toBeNull();
    expect(removeObstacleOps(null, 0)).toBeNull();
  });

  it('stops at eight', () => {
    const full = { obstacles: Array.from({ length: MAX_PANEL_OBSTACLES }, () => newObstacle(basic)) };
    expect(addObstacleOps(full, newObstacle(basic))).toBeNull();
  });
});

describe('wall obstacles in the viewer', () => {
  it('outlines each obstacle and marks the ones behind the carcass that block it', () => {
    const design = apply(basic, [{ op: 'set_site', obstacles: [
      { type: 'socket', x: 300, y: 300, width: 80, height: 80 },
      { type: 'ac', x: 200, y: 2100, width: 900, height: 300 },
      { type: 'window', x: 2500, y: 900, width: 1000, height: 1200 },
      { type: 'pipe', x: -400, y: 200, width: 100, height: 300 },
    ] }]);
    const outlines = obstacleOutlines(design);
    expect(outlines.map((o) => [o.name, o.behind, o.blocking])).toEqual([
      ['שקע', true, false], ['מזגן', true, true], ['חלון', false, false], ['צנרת', false, false],
    ]);
    expect(outlines[0].corners).toEqual([[300, 300], [380, 300], [380, 380], [300, 380], [300, 300]]);
    expect(outlines[1].center).toEqual([650, 2250]);
    expect(obstacleOutlines(basic)).toEqual([]);
  });
});

describe('the scale figure', () => {
  it('is 170 cm tall from the floor up, with feet on the floor', () => {
    const top = Math.max(...FIGURE_PARTS.map((p) => p.center[1] + (p.sphere ?? p.height / 2)));
    const bottom = Math.min(...FIGURE_PARTS.map((p) => p.center[1] - (p.sphere ?? p.height / 2)));
    expect(top).toBe(FIGURE_HEIGHT);
    expect(bottom).toBe(0);
  });

  it('stands right of the wardrobe and is hidden until asked for; dispose frees it', () => {
    expect(figurePlacement(basic)).toEqual({ x: 2450, z: 350 });
    const scene = new THREE.Scene();
    const figure = createFigure(scene);
    expect(figure.group.visible).toBe(false);
    figure.update(basic);
    expect(figure.group.children.find((c) => c.name === 'person').position.x).toBeCloseTo(2.45); // each person at their spot
    const box = new THREE.Box3().setFromObject(figure.group);
    expect(box.max.y).toBeCloseTo(1.7, 2);
    expect(box.min.y).toBeCloseTo(0, 2);
    figure.setVisible(true);
    expect(figure.group.visible).toBe(true);
    figure.group.traverse((o) => { if (o.isMesh) expect(o.raycast()).toBeUndefined(); }); // never picked
    figure.dispose();
    expect(scene.getObjectByName('figure')).toBeUndefined();
  });

  it('the room overlay draws no obstacles without a site', () => {
    const room = createRoomOverlay(new THREE.Scene());
    room.update(basic);
    expect(room.group.children).toHaveLength(0);
  });
});

describe('a proposal that touches the obstacles says so', () => {
  it('shows the count when the list changes size, and a line when an obstacle changes', () => {
    const three = apply(basic, [{ op: 'set_site', obstacles: [newObstacle(basic), newObstacle(basic), newObstacle(basic)] }]);
    const one = apply(three, [{ op: 'set_site', obstacles: [newObstacle(basic)] }]);
    expect(diffDesigns(three, one)).toContain('מכשולים בקיר: 3 ← 1');
    const moved = apply(one, updateObstacleOps(one.site, 0, { y: 500 }));
    expect(diffDesigns(one, moved).some((line) => line.startsWith('מכשולים בקיר'))).toBe(true);
    expect(diffDesigns(one, one)).toEqual([]);
  });
});

describe('an obstacle of another kind', () => {
  const radiator = { type: 'other', name: 'רדיאטור', x: 300, y: 150, width: 800, height: 600 };

  it('keeps the customer\'s word, labels with it, and is a box at its size on the wall', () => {
    const design = apply(basic, [{ op: 'set_site', obstacles: [radiator] }]);
    expect(design.site.obstacles).toEqual([radiator]);
    expect(obstacleOutlines(design).map((o) => [o.name, o.behind, o.blocking])).toEqual([['רדיאטור', true, false]]);
    const group = buildObstacles(design, design.dimensions.depth);
    const size = new THREE.Box3().setFromObject(group.getObjectByName('obstacle-other')).getSize(new THREE.Vector3());
    expect([Math.round(size.x * 1000), Math.round(size.y * 1000), Math.round(size.z * 1000)]).toEqual([800, 600, 100]);
    group.userData.dispose();
  });

  it('needs a visible name of at most 30 characters', () => {
    expect(() => apply(basic, [{ op: 'set_site', obstacles: [{ ...radiator, name: null }] }])).toThrow(/obstacles\[0\]\.name/);
    const named = (name) => ({ ...basic, site: { ...(basic.site ?? {}), obstacles: [{ ...radiator, name }] } });
    expect(validateDesign(named('רדיאטור'), catalog)).toEqual([]);
    expect(validateDesign(named(null), catalog).map((e) => e.path)).toEqual(['site.obstacles[0].name']);
    expect(validateDesign(named(' '), catalog)).not.toEqual([]);
    expect(validateDesign(named('x\u202e'), catalog)).not.toEqual([]);
    expect(validateDesign(named('ע'.repeat(31)), catalog)).not.toEqual([]);
  });

  it('the panel option "אחר" names it "מכשול" until the customer renames it', () => {
    const one = apply(basic, addObstacleOps(basic.site, newObstacle(basic)));
    const other = apply(one, updateObstacleOps(one.site, 0, { type: 'other', name: 'מכשול' }));
    expect(other.site.obstacles[0]).toMatchObject({ type: 'other', name: 'מכשול' });
  });
});

describe('people where they stand, and furniture in the room (ADR-041)', () => {
  it('a person with a place stands there; the others keep the row beside the wardrobe', () => {
    const design = apply(basic, [{ op: 'set_household', people: [{ height: 1700, at: [-800, 1200] }, { height: 1100 }] }]);
    expect(figureSpots(design)).toEqual([{ x: -800, z: 1200 }, { x: 2450 + 550, z: 350 }]);
    const figure = createFigure(new THREE.Scene());
    figure.update(design);
    const bodies = figure.group.children.filter((c) => c.name === 'person');
    expect(bodies.map((b) => [Math.round(b.position.x * 1000), Math.round(b.position.z * 1000), b.userData.personIndex])).toEqual([[-800, 1200, 0], [3000, 350, 1]]);
    figure.dispose();
    expect(figureSpots(basic)).toEqual([{ x: 2450, z: 350 }]); // no household: the default person
  });

  it('furniture stands at its place and size, turned with its rotation', () => {
    const design = apply(basic, [{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 },
      furniture: [{ type: 'bed', x: 2000, y: 2600, width: 1600, depth: 2000, height: 550 },
        { type: 'dresser', x: 3400, y: 2000, width: 1000, depth: 500, height: 850, rotation: 90 }] }]); // offset 1000
    const group = buildFurniture(design);
    const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().map((v) => Math.round(v * 1000));
    const [bed, dresser] = group.children;
    expect([bed.userData.furnitureIndex, dresser.userData.furnitureIndex]).toEqual([0, 1]);
    expect([Math.round(bed.position.x * 1000), Math.round(bed.position.z * 1000)]).toEqual([1000, 2000]); // plan (2000, 2600) → frame
    expect(size(bed)[0]).toBe(1600);
    expect(size(dresser)[0]).toBeGreaterThanOrEqual(500); // turned 90°: its depth (and drawer fronts) runs across
    expect(size(dresser)[0]).toBeLessThan(520);
    group.userData.dispose();
    expect(buildFurniture(basic)).toBeNull();
  });
});
