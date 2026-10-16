import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DOOR_OPEN_ANGLE, applyDoorPose, createDoorMotion, easeInOutCubic } from '../../../src/viewer/doorMotion.js';

function door(userData, { width = 0.6, depth = 0.018, x = 1, z = 0.009 } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2, depth));
  mesh.position.set(x, 1, z);
  mesh.userData = { componentId: 'dr_a', kind: 'door', ...userData };
  return mesh;
}

describe('door poses', () => {
  it('swings a left-hinged door outwards around its left edge', () => {
    const mesh = door({ doorType: 'hinged', hingeSide: 'left' });
    applyDoorPose(mesh, 1);
    expect(mesh.rotation.y).toBeCloseTo(-DOOR_OPEN_ANGLE);
    expect(mesh.position.z).toBeGreaterThan(0.25); // now sticks out towards the viewer
    expect(mesh.position.x).toBeLessThan(0.75); // and stays near the hinge on the left
    applyDoorPose(mesh, 0);
    expect(mesh.position.toArray()).toEqual([1, 1, 0.009]); // back to exactly closed
    expect(mesh.rotation.y).toBe(0);
  });

  it('swings a right-hinged door the other way', () => {
    const mesh = door({ doorType: 'hinged', hingeSide: 'right' });
    applyDoorPose(mesh, 1);
    expect(mesh.rotation.y).toBeCloseTo(DOOR_OPEN_ANGLE);
    expect(mesh.position.x).toBeGreaterThan(1.25);
  });

  it('slides a sliding panel along its track', () => {
    const mesh = door({ doorType: 'sliding', slideDir: -1 });
    applyDoorPose(mesh, 1);
    expect(mesh.position.x).toBeLessThan(0.5);
    expect(mesh.position.z).toBeCloseTo(0.009);
  });

  it('eases in and out', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
  });
});

describe('door motion', () => {
  it('animates towards the target over the duration and toggles back', () => {
    const group = new THREE.Group();
    const mesh = door({ doorType: 'hinged', hingeSide: 'left' });
    group.add(mesh);
    const motion = createDoorMotion({ durationMs: 100 });
    motion.toggle('dr_a');
    expect(motion.isOpen('dr_a')).toBe(true);
    expect(motion.tick(50, group)).toBe(true);
    expect(motion.progressOf('dr_a')).toBeCloseTo(0.5);
    motion.tick(80, group);
    expect(motion.progressOf('dr_a')).toBe(1);
    expect(motion.tick(16, group)).toBe(false); // settled: nothing to do
    motion.toggle('dr_a');
    motion.tick(200, group);
    expect(mesh.rotation.y).toBe(0);
  });

  it('re-applies open doors to a rebuilt scene and forgets removed ones', () => {
    const motion = createDoorMotion({ durationMs: 0 });
    const first = new THREE.Group();
    first.add(door({ doorType: 'hinged', hingeSide: 'left' }));
    motion.toggle('dr_a');
    motion.tick(16, first);
    const rebuilt = new THREE.Group();
    const fresh = door({ doorType: 'hinged', hingeSide: 'left' });
    rebuilt.add(fresh);
    motion.attach(rebuilt);
    expect(fresh.rotation.y).toBeCloseTo(-DOOR_OPEN_ANGLE);
    motion.attach(new THREE.Group());
    expect(motion.isOpen('dr_a')).toBe(false);
  });
});

describe('door hardware moves with its door', () => {
  it('rotates a handle about the same hinge as its panel', () => {
    const panel = door({ doorType: 'hinged', hingeSide: 'left' });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.4, 0.012));
    handle.position.set(1.25, 1, 0.024); // near the free (right) edge
    handle.userData = { kind: 'hardware', doorId: 'dr_a' };
    applyDoorPose(panel, 1, [handle]);
    expect(handle.rotation.y).toBeCloseTo(-DOOR_OPEN_ANGLE);
    expect(handle.position.z).toBeGreaterThan(0.5); // swung out with the door
    applyDoorPose(panel, 0, [handle]);
    expect(handle.position.toArray()).toEqual([1.25, 1, 0.024]);
  });

  it('createDoorMotion animates panels together with their tagged parts', () => {
    const group = new THREE.Group();
    const panel = door({ doorType: 'sliding', slideDir: 1 });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.4, 0.01));
    handle.position.set(1.2, 1, 0.03);
    handle.userData = { kind: 'hardware', doorId: 'dr_a' };
    group.add(panel, handle);
    const motion = createDoorMotion({ durationMs: 0 });
    motion.toggle('dr_a');
    motion.tick(16, group);
    expect(handle.position.x - 1.2).toBeCloseTo(panel.position.x - 1, 5);
  });
});
