import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseDoor, restOf } from '../../../src/viewer/doorMotion.js';
import { createMotion, easeInOutCubic } from '../../../src/viewer/motion.js';

describe('createMotion', () => {
  it('runs a tween to completion, then calls done once', () => {
    let time = 0;
    const motion = createMotion(() => time);
    const seen = [];
    let done = 0;
    motion.add({ duration: 100, ease: (t) => t, update: (t) => seen.push(t), done: () => { done += 1; } });
    motion.tick();
    time = 50;
    motion.tick();
    time = 150;
    motion.tick();
    motion.tick();
    expect(seen).toEqual([0, 0.5, 1]);
    expect(done).toBe(1);
  });

  it('cancels by tag without finishing', () => {
    let time = 0;
    const motion = createMotion(() => time);
    let done = false;
    motion.add({ duration: 100, update: () => {}, done: () => { done = true; }, tag: 'camera' });
    expect(motion.isRunning('camera')).toBe(true);
    motion.cancel('camera');
    time = 200;
    motion.tick();
    expect(done).toBe(false);
    expect(motion.isRunning('camera')).toBe(false);
  });

  it('eases symmetrically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe('poseDoor', () => {
  const door = (hingeSide) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.018));
    mesh.position.set(1, 1, 0.009);
    mesh.userData = { kind: 'door', hingeSide };
    return mesh;
  };
  // World x/z of the door's hinge edge (left or right end of its front face centre line).
  const hingePoint = (mesh, side) => new THREE.Vector3(side === 'left' ? -0.3 : 0.3, 0, 0).applyEuler(mesh.rotation).add(mesh.position);

  it.each(['left', 'right'])('swings a %s-hinged door outwards about its hinge edge', (side) => {
    const mesh = door(side);
    const rest = restOf(mesh);
    const hingeBefore = hingePoint(mesh, side);
    poseDoor(mesh, rest, 1, 0);
    const hingeAfter = hingePoint(mesh, side);
    expect(hingeAfter.x).toBeCloseTo(hingeBefore.x, 6);
    expect(hingeAfter.z).toBeCloseTo(hingeBefore.z, 6);
    expect(mesh.position.z).toBeGreaterThan(rest.z); // opens towards the viewer
    poseDoor(mesh, rest, 0, 0);
    expect(mesh.position.x).toBeCloseTo(rest.x, 9);
    expect(mesh.rotation.y).toBeCloseTo(0, 9);
  });

  it('slides a sliding panel forward and towards its nearer side', () => {
    const mesh = door(undefined);
    const rest = restOf(mesh);
    poseDoor(mesh, rest, 1, 2); // wardrobe centre to the right of the panel
    expect(mesh.position.z).toBeGreaterThan(rest.z);
    expect(mesh.position.x).toBeLessThan(rest.x);
  });
});
