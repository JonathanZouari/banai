// The path tracer's state machine, against a fake three-gpu-pathtracer (no WebGL in Node).
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RENDER_ERRORS, RENDER_SAMPLES, createPathTracer, loadRenderEnvironment, unsupportedReason, windowPose,
} from '../../../src/viewer/pathtrace.js';

const HEBREW = /[֐-׿]/;

/** Minimal WebGLPathTracer: one renderSample = one tile; samples count whole passes over all tiles. */
class FakePathTracer {
  constructor(renderer) {
    this.renderer = renderer;
    this.samples = 0;
    this.tiles = new THREE.Vector2(1, 1);
    this.isCompiling = false;
    this.renderToCanvas = true;
    this.fadeDuration = 0;
    this.calls = [];
    this.baked = null;
  }

  setScene(scene, camera) {
    if (this.failSetScene) throw new Error('bvh failed');
    const lights = [];
    scene.traverseVisible((o) => { if (o.isLight) lights.push(o.name || o.type); });
    this.baked = { environment: scene.environment, intensity: scene.environmentIntensity, lights, camera };
    this.calls.push('setScene');
    this.samples = 0;
  }

  updateCamera() {
    this.calls.push('updateCamera');
    this.samples = 0;
  }

  renderSample() {
    this.calls.push(`sample:${this.fadeDuration}`);
    if (this.isCompiling) return;
    this.samples += 1 / (this.tiles.x * this.tiles.y);
  }

  reset() { this.samples = 0; }

  dispose() { this.disposed = true; }
}

const environment = { isTexture: true, name: 'hdr', dispose: vi.fn(), userData: {} };

function setup({ supported = true, loadModule } = {}) {
  const renderer = {
    size: [800, 600],
    getContext: () => (supported ? new globalThis.WebGL2RenderingContext() : {}),
    extensions: { has: (name) => supported && name === 'EXT_color_buffer_float' },
    getDrawingBufferSize(target) { return target.set(...this.size); },
  };
  const scene = new THREE.Scene();
  scene.environment = { name: 'pmrem' };
  scene.environmentIntensity = 0.8;
  const camera = new THREE.PerspectiveCamera();
  const stage = vi.fn();
  const instances = [];
  const tracer = createPathTracer(renderer, scene, camera, {
    stage,
    bounds: () => new THREE.Box3(new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(2, 2.4, 0.02)),
    loadModule: loadModule ?? (async () => ({ WebGLPathTracer: class extends FakePathTracer { constructor(r) { super(r); instances.push(this); } } })),
    loadEnvironment: async () => environment,
  });
  return { renderer, scene, camera, stage, tracer, instances, pt: () => instances[0] };
}

beforeEach(() => vi.stubGlobal('WebGL2RenderingContext', class WebGL2RenderingContext {}));
afterEach(() => vi.unstubAllGlobals());

describe('unsupportedReason', () => {
  it('needs WebGL2 and float render targets, and says so in Hebrew', () => {
    expect(unsupportedReason(setup().renderer)).toBeNull();
    vi.unstubAllGlobals(); // no WebGL2RenderingContext at all
    expect(unsupportedReason({ getContext: () => ({}), extensions: { has: () => true } })).toBe(RENDER_ERRORS.noWebGL2);
    vi.stubGlobal('WebGL2RenderingContext', class WebGL2RenderingContext {});
    const noFloat = { getContext: () => new globalThis.WebGL2RenderingContext(), extensions: { has: () => false } };
    expect(unsupportedReason(noFloat)).toBe(RENDER_ERRORS.noFloat);
    expect(unsupportedReason(null)).toBe(RENDER_ERRORS.noWebGL2);
    Object.values(RENDER_ERRORS).forEach((message) => expect(message).toMatch(HEBREW));
  });

  it('makes startRender reject with a Hebrew Error, without loading the engine', async () => {
    const loadModule = vi.fn();
    const { tracer } = setup({ supported: false, loadModule });
    await expect(tracer.start()).rejects.toThrow(RENDER_ERRORS.noWebGL2);
    expect(loadModule).not.toHaveBeenCalled();
    expect(tracer.rendering).toBe(false);
    await expect(tracer.prewarm()).resolves.toBe(false);
  });
});

describe('a render', () => {
  it('stages the scene, lights the window and bakes it with the equirect environment', async () => {
    const { tracer, stage, scene, pt } = setup();
    const onProgress = vi.fn();
    await tracer.start({ onProgress });
    expect(tracer.rendering).toBe(true);
    expect(stage).toHaveBeenCalledWith(true, { environment, intensity: 0.95 });
    expect(pt().calls).toEqual(['setScene']);
    expect(pt().baked.lights).toContain('render-window');
    expect(tracer.windowLight.visible).toBe(true);
    expect(scene.getObjectByName('render-window')).toBe(tracer.windowLight);
    expect(onProgress).toHaveBeenLastCalledWith(0, RENDER_SAMPLES, false);
  });

  it('accumulates one tile per tick and reports completion once', async () => {
    const { tracer, pt } = setup();
    const onProgress = vi.fn();
    await tracer.start({ onProgress });
    pt().tiles.set(1, 1); // one tick = one whole sample
    for (let i = 0; i < RENDER_SAMPLES + 20; i += 1) tracer.tick();
    expect(pt().samples).toBe(RENDER_SAMPLES);
    expect(pt().calls.filter((c) => c.startsWith('sample'))).toHaveLength(RENDER_SAMPLES); // no work once done
    const done = onProgress.mock.calls.filter(([samples]) => samples === RENDER_SAMPLES);
    expect(done).toEqual([[RENDER_SAMPLES, RENDER_SAMPLES, false]]);
    expect(onProgress).toHaveBeenCalledWith(1, RENDER_SAMPLES, false);
  });

  it('restarts accumulation when the camera moves, and reports completion again', async () => {
    const { tracer, pt } = setup();
    const onProgress = vi.fn();
    await tracer.start({ onProgress });
    tracer.step(RENDER_SAMPLES);
    tracer.invalidate();
    expect(pt().calls.at(-1)).toBe('updateCamera');
    expect(tracer.progress().samples).toBe(0);
    tracer.step(RENDER_SAMPLES);
    expect(onProgress.mock.calls.filter(([samples]) => samples === RENDER_SAMPLES)).toHaveLength(2);
  });

  it('steps whole samples synchronously, without the raster fade, and not while compiling', async () => {
    const { tracer, pt } = setup();
    await tracer.start();
    pt().tiles.set(2, 2);
    pt().fadeDuration = 350;
    expect(tracer.step(3)).toEqual({ samples: 3, total: RENDER_SAMPLES, compiling: false });
    expect(pt().calls.filter((c) => c.startsWith('sample'))).toEqual(Array(12).fill('sample:0'));
    expect(pt().fadeDuration).toBe(350);
    pt().isCompiling = true;
    expect(tracer.step(5)).toEqual({ samples: 3, total: RENDER_SAMPLES, compiling: true });
    pt().isCompiling = false;
    expect(tracer.step(1000).samples).toBe(RENDER_SAMPLES);
  });

  it('traces nothing while the canvas has no size', async () => {
    const { tracer, renderer, pt } = setup();
    await tracer.start();
    renderer.size = [0, 0];
    tracer.tick();
    expect(tracer.step(5).samples).toBe(0);
    expect(pt().calls.filter((c) => c.startsWith('sample'))).toHaveLength(0);
    renderer.size = [800, 600];
    expect(tracer.step(1).samples).toBe(1);
  });

  it('re-bakes on restage and ends cleanly on stop', async () => {
    const { tracer, stage, pt } = setup();
    await tracer.start();
    tracer.restage();
    expect(pt().calls.filter((c) => c === 'setScene')).toHaveLength(2);
    tracer.stop();
    expect(tracer.rendering).toBe(false);
    expect(stage).toHaveBeenLastCalledWith(false, null);
    expect(tracer.windowLight.visible).toBe(false);
    const before = pt().calls.length;
    tracer.tick();
    tracer.restage();
    expect(tracer.step(5).samples).toBe(0);
    expect(pt().calls).toHaveLength(before);
    tracer.stop(); // idempotent
    expect(stage).toHaveBeenCalledTimes(3);
  });

  it('ends the render instead of throwing when a re-bake fails', async () => {
    const { tracer, pt } = setup();
    await tracer.start();
    pt().failSetScene = true;
    expect(() => tracer.restage()).not.toThrow();
    expect(tracer.rendering).toBe(false);
    expect(tracer.lastError.message).toBe('bvh failed');
  });

  it('does not start when stopped while the engine loads', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { tracer, stage } = setup({ loadModule: () => gate });
    const started = tracer.start();
    tracer.stop();
    release({ WebGLPathTracer: FakePathTracer });
    await started;
    expect(tracer.rendering).toBe(false);
    expect(stage).not.toHaveBeenCalled();
  });

  it('rejects with a Hebrew Error when the engine fails to load, and can retry', async () => {
    const loadModule = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue({ WebGLPathTracer: FakePathTracer });
    const { tracer } = setup({ loadModule });
    await expect(tracer.start()).rejects.toThrow(RENDER_ERRORS.failed);
    await tracer.start();
    expect(tracer.rendering).toBe(true);
    expect(loadModule).toHaveBeenCalledTimes(2);
  });

  it('stops and undoes the staging when the first bake fails', async () => {
    const { tracer, stage } = setup({ loadModule: async () => ({ WebGLPathTracer: class extends FakePathTracer { setScene() { throw new Error('no'); } } }) });
    await expect(tracer.start()).rejects.toThrow(RENDER_ERRORS.failed);
    expect(tracer.rendering).toBe(false);
    expect(stage).toHaveBeenLastCalledWith(false, null);
  });
});

describe('prewarm', () => {
  it('compiles off-canvas with the tracer environment, then restores the live scene', async () => {
    const { tracer, scene, pt, stage } = setup();
    await expect(tracer.prewarm()).resolves.toBe(true);
    expect(pt().baked.environment).toBe(environment);
    expect(pt().baked.intensity).toBe(0.95);
    expect(pt().baked.lights).toContain('render-window');
    expect(scene.environment).toEqual({ name: 'pmrem' });
    expect(scene.environmentIntensity).toBe(0.8);
    expect(tracer.windowLight.visible).toBe(false);
    expect(pt().renderToCanvas).toBe(true);
    expect(pt().samples).toBe(0);
    expect(stage).not.toHaveBeenCalled(); // the visible scene is never touched
    expect(tracer.prewarm()).toBe(tracer.prewarm()); // one warm-up
  });
});

describe('helpers', () => {
  it('places the window light up and to the front-left of the wardrobe, aimed at it', () => {
    const pose = windowPose(new THREE.Box3(new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(2, 2.4, 0)));
    expect(pose.position.map((v) => Number(v.toFixed(6)))).toEqual([-1.4, 2.1, 2.2]);
    expect(pose.target.map((v) => Number(v.toFixed(6)))).toEqual([1, 1.1, -0.3]);
  });

  it('loads the HDR as an equirect environment', async () => {
    const texture = new THREE.DataTexture(new Float32Array(4), 1, 1);
    const loaded = await loadRenderEnvironment({}, { loadHdr: async () => texture });
    expect(loaded).toBe(texture);
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
  });

  it('disposes the engine, the environment and the window light', async () => {
    const { tracer, scene, pt } = setup();
    await tracer.start();
    tracer.dispose();
    expect(pt().disposed).toBe(true);
    expect(environment.dispose).toHaveBeenCalled();
    expect(scene.getObjectByName('render-window')).toBeUndefined();
    expect(tracer.rendering).toBe(false);
  });
});
