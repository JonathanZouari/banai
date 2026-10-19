// Wall obstacles and the scale figure (ADR-031): the panel's ops, the pencil outlines (R23's "behind" test
// in the viewer) and the figure's proportions and placement.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  MAX_PANEL_OBSTACLES, addObstacleOps, newObstacle, removeObstacleOps, updateObstacleOps,
} from '../../../src/editor/interiorOps.js';
import { FIGURE_HEIGHT, FIGURE_PARTS, createFigure, figurePlacement } from '../../../src/viewer/figure.js';
import { createRoomOverlay, obstacleOutlines } from '../../../src/viewer/room.js';
import { diffDesigns } from '../../../src/state/diff.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // W 2000, H 2400
const apply = (design, ops) => applyOps(design, ops, catalog);

describe('wall obstacle ops', () => {
  it('adds, changes and removes one obstacle at a time; the last removal clears the list', () => {
    const one = apply(basic, addObstacleOps(basic.site, newObstacle(basic)));
    expect(one.site.obstacles).toEqual([{ type: 'socket', x: 960, y: 300, width: 80, height: 80 }]);
    const ac = apply(one, updateObstacleOps(one.site, 0, { type: 'ac', y: 2100, width: 900 }));
    expect(ac.site.obstacles[0]).toEqual({ type: 'ac', x: 960, y: 2100, width: 900, height: 80 });
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
    expect(figure.group.position.x).toBeCloseTo(2.45);
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
