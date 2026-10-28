import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPIN_DURATION_MS, createTurntable, turntableAngle } from '../../../src/viewer/turntable.js';

describe('turntableAngle', () => {
  it('goes from 0 to a full turn, eased at both ends', () => {
    expect(turntableAngle(0)).toBe(0);
    expect(turntableAngle(SPIN_DURATION_MS / 2)).toBeCloseTo(Math.PI);
    expect(turntableAngle(SPIN_DURATION_MS)).toBeCloseTo(2 * Math.PI);
    // slow start: the first tenth of the time covers far less than a tenth of the turn
    expect(turntableAngle(SPIN_DURATION_MS / 10)).toBeLessThan((2 * Math.PI) / 10 / 2);
  });

  it('only ever moves forward and is clamped outside the duration', () => {
    let previous = -1;
    for (let ms = 0; ms <= SPIN_DURATION_MS; ms += 250) {
      const angle = turntableAngle(ms);
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
    expect(turntableAngle(-500)).toBe(0);
    expect(turntableAngle(SPIN_DURATION_MS * 3)).toBeCloseTo(2 * Math.PI);
  });
});

describe('createTurntable', () => {
  const setup = () => {
    let time = 0;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 1.5, 4);
    const target = new THREE.Vector3(1, 1.2, -0.3);
    const changes = [];
    const turntable = createTurntable({
      camera, target, duration: 1000, now: () => time, onChange: (spinning) => changes.push(spinning),
    });
    return { camera, target, turntable, changes, advance: (ms) => { time += ms; } };
  };
  const distanceTo = (camera, target) => camera.position.distanceTo(target);

  it('circles the target at a constant distance and height, then ends where it started', () => {
    const { camera, target, turntable, changes, advance } = setup();
    const start = camera.position.clone();
    const radius = distanceTo(camera, target);
    turntable.start();
    advance(500);
    expect(turntable.tick()).toBe(true);
    expect(distanceTo(camera, target)).toBeCloseTo(radius);
    expect(camera.position.y).toBeCloseTo(start.y);
    expect(camera.position.distanceTo(start)).toBeGreaterThan(1); // halfway round: the other side
    advance(600);
    expect(turntable.tick()).toBe(false);
    expect(camera.position.equals(start)).toBe(true);
    expect(turntable.isSpinning()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('Stop returns to the start; a takeover stays where the camera is', () => {
    const { camera, turntable, advance } = setup();
    const start = camera.position.clone();
    turntable.start();
    advance(300);
    turntable.tick();
    turntable.stop();
    expect(camera.position.equals(start)).toBe(true);

    turntable.start();
    advance(300);
    turntable.tick();
    const midway = camera.position.clone();
    turntable.stop({ restore: false });
    expect(camera.position.equals(midway)).toBe(true);
  });

  it('ignores a second start and a stop when idle', () => {
    const { turntable, changes } = setup();
    turntable.stop();
    turntable.start();
    turntable.start();
    expect(changes).toEqual([true]);
    expect(turntable.tick()).toBe(true);
  });
});
