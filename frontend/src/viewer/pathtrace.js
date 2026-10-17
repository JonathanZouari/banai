// Path-traced still render, ported from the P1 prototype (three-gpu-pathtracer, loaded on demand).
// The viewer stages the scene through `stage(on, set)`: doors at rest, overlays and labels hidden,
// raster-only lights off, and the environment's render set (`set` = { environment, intensity }).
// The tracer bakes the staged scene into a BVH and accumulates RENDER_SAMPLES samples while the
// viewer's loop calls tick(). A camera move restarts accumulation (invalidate); anything that
// moves or rebuilds geometry must call restage(). P1's soft "window" area light is on only while
// rendering: an area light is sampled directly, so it converges far faster than environment light.
// User-facing errors are Hebrew.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const RENDER_SAMPLES = 400;
export const ENVIRONMENT_URL = '/env/small_empty_room_3_1k.hdr'; // the room backdrop's CC0 HDR, as in P1
const ENVIRONMENT_INTENSITY = 0.95; // P1
const PREWARM_TIMEOUT_MS = 120_000;
const PREWARM_POLL_MS = 250;

export const RENDER_ERRORS = Object.freeze({
  noWebGL2: 'רינדור פוטוריאליסטי דורש WebGL2, והדפדפן הזה לא תומך בו.',
  noFloat: 'רינדור פוטוריאליסטי דורש תמיכה בציור למרקמי float, והדפדפן הזה לא תומך בה.',
  failed: 'לא הצלחנו להפעיל את מנוע הרינדור הפוטוריאליסטי בדפדפן הזה.',
});

/** Why this renderer cannot path trace (a Hebrew message), or null when it can. */
export function unsupportedReason(renderer) {
  const gl = renderer?.getContext?.();
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!webgl2) return RENDER_ERRORS.noWebGL2;
  if (!renderer.extensions?.has?.('EXT_color_buffer_float')) return RENDER_ERRORS.noFloat;
  return null;
}

/**
 * The tracer's environment: an equirect HDR it can importance-sample. Offline fallback: the
 * studio's RoomEnvironment rendered to a cube map, which the tracer converts itself.
 */
export async function loadRenderEnvironment(renderer, { url = ENVIRONMENT_URL, loadHdr = (u) => new HDRLoader().loadAsync(u) } = {}) {
  try {
    const texture = await loadHdr(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  } catch {
    const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const room = new RoomEnvironment();
    new THREE.CubeCamera(0.1, 100, target).update(renderer, room);
    room.dispose();
    target.texture.userData.target = target; // disposed with the texture
    return target.texture;
  }
}

const disposeEnvironment = (texture) => {
  texture?.dispose();
  texture?.userData?.target?.dispose();
};

/** Window light pose (P1, relative to the wardrobe): up and to the front-left, aimed at its middle. */
export function windowPose(bounds) {
  const cx = bounds ? (bounds.min.x + bounds.max.x) / 2 : 0;
  const back = bounds ? bounds.min.z : 0;
  return { position: [cx - 2.4, 2.1, back + 2.8], target: [cx, 1.1, back + 0.3] };
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{ stage?: (on: boolean, set: object|null) => void, bounds?: () => THREE.Box3|null,
 *   loadModule?: () => Promise<{ WebGLPathTracer: Function }>, loadEnvironment?: (renderer) => Promise<THREE.Texture> }} [options]
 */
export function createPathTracer(renderer, scene, camera, {
  stage = () => {},
  bounds = () => null,
  loadModule = () => import('three-gpu-pathtracer'),
  loadEnvironment = loadRenderEnvironment,
} = {}) {
  const windowLight = new THREE.RectAreaLight('#fff4e6', 7, 1.6, 2.1);
  windowLight.name = 'render-window';
  windowLight.visible = false;
  scene.add(windowLight);

  let tracer = null;
  let environment = null;
  let loading = null;
  let warming = null;
  let rendering = false;
  let finished = false;
  let onProgress = null;
  let token = 0;
  let disposed = false;
  let lastError = null;

  // A hidden or collapsed canvas has no drawing buffer: tracing into zero-size targets only makes GL errors.
  const bufferSize = new THREE.Vector2();
  const drawable = () => {
    if (typeof renderer.getDrawingBufferSize !== 'function') return true;
    renderer.getDrawingBufferSize(bufferSize);
    return bufferSize.x > 0 && bufferSize.y > 0;
  };

  const load = () => {
    loading ??= Promise.all([loadModule(), loadEnvironment(renderer)])
      .then(([module, texture]) => {
        if (disposed) {
          disposeEnvironment(texture);
          throw new Error('disposed');
        }
        environment = texture;
        const pt = new module.WebGLPathTracer(renderer);
        Object.assign(pt, { bounces: 6, filterGlossyFactor: 0.5, renderDelay: 0, minSamples: 1, fadeDuration: 350 });
        pt.tiles.set(2, 2);
        tracer = pt;
        return pt;
      })
      .catch((cause) => {
        loading = null;
        throw new Error(RENDER_ERRORS.failed, { cause });
      });
    return loading;
  };

  const renderSet = () => ({ environment, intensity: ENVIRONMENT_INTENSITY });

  const placeWindow = () => {
    const { position, target } = windowPose(bounds());
    windowLight.position.fromArray(position);
    windowLight.lookAt(...target);
  };

  const progress = () => ({
    samples: tracer ? Math.min(RENDER_SAMPLES, Math.floor(tracer.samples)) : 0,
    total: RENDER_SAMPLES,
    compiling: Boolean(tracer?.isCompiling),
  });

  // onProgress(samples, total, compiling) on every step; completion is reported once as (total, total, false).
  const report = () => {
    if (!rendering || !tracer || !onProgress) return;
    if (tracer.samples >= RENDER_SAMPLES) {
      if (!finished) onProgress(RENDER_SAMPLES, RENDER_SAMPLES, false);
      finished = true;
      return;
    }
    const { samples, total, compiling } = progress();
    onProgress(samples, total, compiling);
  };

  const stop = () => {
    token += 1;
    if (!rendering) return;
    rendering = false;
    finished = false;
    onProgress = null;
    windowLight.visible = false;
    stage(false, null);
  };

  /** Re-stage the scene and bake it again (doors moved, geometry rebuilt); accumulation restarts. */
  const restage = () => {
    if (!rendering || !tracer) return;
    stage(true, renderSet());
    placeWindow();
    windowLight.visible = true;
    tracer.setScene(scene, camera);
    finished = false;
  };

  return {
    get rendering() { return rendering; },
    get lastError() { return lastError; },
    get windowLight() { return windowLight; },
    progress,

    /** Start (or restart) a render. Resolves once accumulation has begun; rejects with a Hebrew Error. */
    async start({ onProgress: callback } = {}) {
      const reason = unsupportedReason(renderer);
      if (reason) throw new Error(reason);
      const mine = ++token;
      const pt = await load();
      if (mine !== token || disposed) return; // stopped (or restarted) while the engine loaded
      onProgress = typeof callback === 'function' ? callback : null;
      rendering = true;
      pt.renderToCanvas = true;
      try {
        restage();
      } catch (cause) {
        stop();
        throw new Error(RENDER_ERRORS.failed, { cause });
      }
      report();
    },

    stop,

    /** Safe re-stage for the viewer: a failure ends the render instead of breaking the frame loop. */
    restage() {
      try {
        restage();
      } catch (error) {
        lastError = error;
        stop();
      }
    },

    /** The camera moved (orbit, view change, resize): restart accumulation from this viewpoint. */
    invalidate() {
      if (!rendering || !tracer) return;
      tracer.updateCamera();
      finished = false;
    },

    /** One frame of the render loop: one tile of the next sample until RENDER_SAMPLES. */
    tick() {
      if (!rendering || !tracer) return;
      if (tracer.samples < RENDER_SAMPLES && drawable()) tracer.renderSample();
      report();
    },

    /**
     * Render `count` more full samples synchronously (tests; a hidden page pauses rAF). Returns
     * the progress; nothing advances while the shader compiles or while the canvas has no size.
     */
    step(count = 1) {
      if (!rendering || !tracer || !drawable()) return progress();
      const target = Math.min(RENDER_SAMPLES, Math.floor(tracer.samples) + Math.max(0, Math.floor(count) || 0));
      const tiles = tracer.tiles.x * tracer.tiles.y;
      const fade = tracer.fadeDuration;
      tracer.fadeDuration = 0; // no time passes between these samples, so a fade would never finish
      try {
        for (let guard = (target + 1) * tiles; guard > 0 && tracer.samples < target && !tracer.isCompiling; guard -= 1) {
          tracer.renderSample();
        }
      } finally {
        tracer.fadeDuration = fade;
      }
      report();
      return progress();
    },

    /**
     * Load the engine and compile its shader in the background (the first compile can take tens
     * of seconds on ANGLE/D3D11), so the first render starts at once. Draws nothing on the canvas.
     * Resolves true when warm, false when this browser cannot path trace.
     */
    prewarm() {
      if (unsupportedReason(renderer)) return Promise.resolve(false);
      warming ??= (async () => {
        const pt = await load();
        if (rendering || disposed) return true;
        // Bake the live scene once with the tracer's lights and environment (it cannot sample PMREM).
        const previous = [scene.environment, scene.environmentIntensity];
        scene.environment = environment;
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        windowLight.visible = true;
        try {
          pt.setScene(scene, camera);
        } finally {
          [scene.environment, scene.environmentIntensity] = previous;
          windowLight.visible = rendering;
        }
        pt.renderToCanvas = false;
        const started = performance.now();
        await new Promise((resolve) => {
          const poll = () => {
            if (rendering || disposed) return resolve();
            if (drawable()) pt.renderSample(); // the first sample triggers the compile
            if (pt.samples === 0 && performance.now() - started < PREWARM_TIMEOUT_MS) setTimeout(poll, PREWARM_POLL_MS);
            else resolve();
          };
          poll();
        });
        if (!rendering) {
          pt.renderToCanvas = true;
          pt.reset();
        }
        return true;
      })().catch((error) => {
        warming = null;
        throw error;
      });
      return warming;
    },

    dispose() {
      stop();
      disposed = true;
      tracer?.dispose();
      tracer = null;
      disposeEnvironment(environment);
      environment = null;
      scene.remove(windowLight);
      windowLight.dispose();
    },
  };
}
