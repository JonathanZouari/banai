import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { FURNITURE } from '../../../src/room/catalog.js';
import { WARDROBE_FRONT } from '../../../src/room/layout.js';
import { blocksView, placeFurniture, PRESET_IDS, wardrobeSamples } from '../../../src/room/placement.js';
import { ROOM_DEFAULTS } from '../../../src/room/roomState.js';
import { bedEye, NATURAL_FOV, roomView } from '../../../src/room/views.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const make = (width, height, depth, count) => applyOps(null, [{ op: 'create_wardrobe', width, height, depth, compartmentCount: count }], catalog);
const DESIGNS = { basic: loadDesign('basic'), kids: make(1000, 1500, 500, 2), double: make(2200, 2400, 650, 2), minimal: make(1200, 2200, 600, 2), wide: make(3000, 2600, 650, 4) };
const room = (wardrobeAt, preset, size = ROOM_DEFAULTS.size) => ({ ...ROOM_DEFAULTS, enabled: true, wardrobeAt, preset, size });

/** A three.js camera for a pose (mm -> m), to test what is in frame. */
function cameraFor(pose, aspect) {
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, 0.05, 80);
  camera.position.set(pose.position.x / 1000, pose.position.y / 1000, pose.position.z / 1000);
  camera.lookAt(pose.target.x / 1000, pose.target.y / 1000, pose.target.z / 1000);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
const inFrame = (camera, { x, y, z }) => {
  const p = new THREE.Vector3(x / 1000, y / 1000, z / 1000).project(camera);
  return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
};
const wardrobeCorners = (design) => [0, design.dimensions.width].flatMap((x) => [0, design.dimensions.height].map((y) => ({ x, y, z: WARDROBE_FRONT })));

const setups = Object.entries(DESIGNS).flatMap(([name, design]) => ['left', 'centre', 'right'].flatMap((at) => PRESET_IDS.map((preset) => ({ name, design, at, preset }))));

describe('room camera views', () => {
  for (const aspect of [1.75, 1.2, 0.9]) { // 0.9: a narrow view above the bottom-sheet panel
    it(`doorway and bed: the whole wardrobe in frame, nothing blocking it, a natural lens (aspect ${aspect})`, () => {
      for (const { name, design, at, preset } of setups) {
        const { placed, box } = placeFurniture(design, room(at, preset), preset);
        for (const view of ['doorway', 'bed']) {
          const label = `${name}/${at}/${preset}/${view}`;
          const pose = roomView(view, { design, box, placed, aspect });
          const camera = cameraFor(pose, aspect);
          wardrobeCorners(design).forEach((corner) => expect(inFrame(camera, corner), `${label} corner ${JSON.stringify(corner)}`).toBe(true));
          expect(pose.fov, label).toBeGreaterThanOrEqual(NATURAL_FOV);
          expect(pose.fov, label).toBeLessThanOrEqual(58);
          const eye = pose.position;
          placed.filter((p) => !FURNITURE[p.kind].underlay && !(view === 'bed' && p.id === 'bed')).forEach((piece) => {
            expect(blocksView(piece.rect, FURNITURE[piece.kind].height, eye, wardrobeSamples(design)), `${label} blocked by ${piece.id}`).toBe(false);
          });
        }
      }
    });
  }

  it('doorway: the whole window is in frame with the wardrobe (standard wardrobes, default room)', () => {
    for (const name of ['basic', 'kids', 'double', 'minimal']) {
      const design = DESIGNS[name];
      for (const preset of PRESET_IDS) {
        const { placed, box } = placeFurniture(design, room('centre', preset), preset);
        for (const aspect of [1.75, 1.3]) { // 1.3: the view with the Room panel open beside it
          const camera = cameraFor(roomView('doorway', { design, box, placed, aspect }), aspect);
          // The whole window, all four corners, with the wardrobe.
          [box.window.z0, box.window.z1].forEach((z) => [box.window.y0, box.window.y1].forEach((y) => {
            expect(inFrame(camera, { x: box.x1, y, z }), `${name}/${preset}/${aspect} window corner`).toBe(true);
          }));
        }
      }
    }
  });

  it('eye-level views orbit around the wardrobe: the target is at its front, not in mid-air', () => {
    const { placed, box } = placeFurniture(DESIGNS.basic, room('centre', 'couple'), 'couple');
    for (const view of ['doorway', 'bed']) {
      const pose = roomView(view, { design: DESIGNS.basic, box, placed, aspect: 1.75 });
      expect(Math.abs(pose.target.z - WARDROBE_FRONT), view).toBeLessThan(5);
    }
  });

  it('bed: sitting up against the headboard, facing the wardrobe', () => {
    const { placed } = placeFurniture(DESIGNS.basic, room('centre', 'couple'), 'couple');
    const eye = bedEye(placed, DESIGNS.basic);
    const bed = placed.find((p) => p.id === 'bed');
    expect(eye.y).toBe(1200);
    expect(eye.x).toBeGreaterThanOrEqual(bed.rect.x0);
    expect(eye.x).toBeLessThanOrEqual(bed.rect.x1);
    expect(eye.z).toBeGreaterThanOrEqual(bed.rect.z0);
    expect(eye.z).toBeLessThanOrEqual(bed.rect.z1);
    // In the headboard half: the bed faces away from the wall its headboard stands against.
    const facing = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }[bed.rotation];
    expect((eye.x - bed.x) * facing[0] + (eye.z - bed.z) * facing[1]).toBeLessThan(0);
  });

  it('plan: the whole room from above, wardrobe wall at the top; overview frames the wardrobe', () => {
    for (const size of [ROOM_DEFAULTS.size, { width: 8000, length: 8000, height: 4000 }]) {
      const design = DESIGNS.basic;
      const { placed, box } = placeFurniture(design, room('centre', 'couple', size), 'couple');
      for (const aspect of [1.75, 0.8]) {
        const plan = cameraFor(roomView('plan', { design, box, placed, aspect }), aspect);
        [[box.x0, box.zBack], [box.x1, box.zBack], [box.x0, box.zFront], [box.x1, box.zFront]].forEach(([x, z]) => expect(inFrame(plan, { x, y: 0, z })).toBe(true));
        const back = new THREE.Vector3(0, 0, box.zBack / 1000).project(plan);
        const front = new THREE.Vector3(0, 0, box.zFront / 1000).project(plan);
        expect(back.y).toBeGreaterThan(front.y);
        const overview = cameraFor(roomView('overview', { design, box, placed, aspect }), aspect);
        wardrobeCorners(design).forEach((corner) => expect(inFrame(overview, corner)).toBe(true));
      }
    }
  });
});
