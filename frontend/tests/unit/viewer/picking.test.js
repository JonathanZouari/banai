import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPicking } from '../../../src/viewer/picking.js';

// A fake canvas and camera: enough to drive the pointer handlers without WebGL.
function setup() {
  const listeners = {};
  const dom = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 5;
  const onHover = vi.fn();
  const onLeave = vi.fn();
  const onPick = vi.fn();
  const detach = attachPicking({ dom, camera, getTargets: () => [], onPick, onHover, onLeave });
  return { listeners, onHover, onLeave, onPick, detach };
}

describe('attachPicking hover', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn) => { fn(); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('passes the pointer event as the second argument of onHover', () => {
    const { listeners, onHover } = setup();
    const event = { clientX: 40, clientY: 60, buttons: 0 };
    listeners.pointermove(event);
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover.mock.calls[0][1]).toBe(event);
    expect(onHover.mock.calls[0][0]).toBeNull(); // no targets, so no hit
  });

  it('does nothing while a mouse button is held (orbit or drag)', () => {
    const { listeners, onHover } = setup();
    listeners.pointermove({ clientX: 10, clientY: 10, buttons: 1 });
    expect(onHover).not.toHaveBeenCalled();
  });

  it('calls onLeave on pointerleave and on pointerdown', () => {
    const { listeners, onLeave } = setup();
    listeners.pointerleave();
    listeners.pointerdown({ clientX: 1, clientY: 1 });
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it('a click still picks, and removes every listener on detach', () => {
    const { listeners, onPick, detach } = setup();
    listeners.pointerdown({ clientX: 10, clientY: 10 });
    listeners.pointerup({ clientX: 11, clientY: 10 });
    expect(onPick).toHaveBeenCalledTimes(1);
    detach();
    expect(Object.keys(listeners)).toEqual([]);
  });

  it('a press cancels a hover that was waiting for the next frame', () => {
    const queue = new Map();
    let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (fn) => { queue.set(nextId, fn); return nextId++; });
    vi.stubGlobal('cancelAnimationFrame', (id) => { queue.delete(id); });
    const { listeners, onHover } = setup();
    listeners.pointermove({ clientX: 40, clientY: 60, buttons: 0 }); // a hover is scheduled
    listeners.pointerdown({ clientX: 40, clientY: 60 }); // the press arrives before the frame
    queue.forEach((fn) => fn()); // the frame runs now: nothing is left to run
    expect(onHover).not.toHaveBeenCalled();
  });

  it('existing callers that pass only onHover and onPick keep working', () => {
    const listeners = {};
    const dom = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
    attachPicking({ dom, camera: new THREE.PerspectiveCamera(), getTargets: () => [], onPick: () => {} });
    expect(() => { listeners.pointerleave(); listeners.pointerdown({ clientX: 0, clientY: 0 }); listeners.pointermove({ clientX: 0, clientY: 0, buttons: 0 }); }).not.toThrow();
  });
});
