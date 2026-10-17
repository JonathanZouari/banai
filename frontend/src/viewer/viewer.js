// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select(). While `ui.comparing` is on it shows the saved `version`
// instead of the design (read defensively: older stores have neither).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { ledLevel, ledLightsOf, setLedLevel } from './builders/inserts.js';
import { VIEWS, blendPose, easeInOut, poseAlong, poseFor } from './camera.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { attachEdges, detachEdges } from './edges.js';
import { createEnvironment } from './environment.js';
import { createFlasher, resolveFlashTargets } from './flash.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { createPathTracer } from './pathtrace.js';
import { attachPicking } from './picking.js';
import { fitShadowCamera } from './shadow.js';

RectAreaLightUniformsLib.init(); // LED strips and the render's window light are area lights

// Optional modules from the builders workstream: a missing one never breaks the viewer.
const optional = import.meta.glob(['./hardware.js', './doorMotion.js', './props.js'], { eager: true });
const { createHardware } = optional['./hardware.js'] ?? {};
const { applyDoorMotion } = optional['./doorMotion.js'] ?? {};
const { buildProps, disposeProps } = optional['./props.js'] ?? {};

const BACKGROUND = '#eceeec';
const RENDER_EXPOSURE = 0.85;
const VIEW_MS = 300;
const MAX_DISTANCE = 14;
const FLOOR_SIZE = 12; // m, same as the grid
const DOOR_RESPONSE_S = 0.35; // critically damped spring, ~0.35 s response
const DOOR_OMEGA = (2 * Math.PI) / DOOR_RESPONSE_S;
const PROPS_SEED = 7;
const CANVAS_LABEL = 'תצוגת תלת־ממד של הארון';
const noRaycast = () => {};

/** Invisible ground that only shows the wardrobe's shadow. It lies at y = 0, 0.5 mm above the grid (so the shadow tints the grid lines too), and is never picked. */
function createFloor() {
  const geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE).rotateX(-Math.PI / 2);
  const material = new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false });
  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'floor';
  floor.receiveShadow = true;
  floor.raycast = noRaycast;
  return floor;
}

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  // The environment map carries most of the ambient light; these only shape it.
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4b8', 0.45));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6; // PCF blur in texels: this is what makes the shadow soft
  scene.add(key, key.target); // the target must be in the scene for the light to aim at it
  const fill = new THREE.DirectionalLight('#ffffff', 0.3);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
  grid.position.y = -0.0005;
  grid.name = 'grid';
  grid.material.toneMapped = false;
  scene.add(grid);
  const floor = createFloor();
  scene.add(floor);
  return { scene, key, fill, floor, grid };
}

/** Map a raycast hit to a selectable component id (the back panel selects its compartment). */
function componentAt(hit, design) {
  if (!hit) return null;
  const { componentId, part } = hit.object.userData;
  if (part !== 'back') return componentId;
  const frame = frameOf(design);
  const xMm = hit.point.x * 1000;
  const index = frame.ranges.findIndex(([x0, x1]) => xMm >= x0 && xMm <= x1);
  return index >= 0 ? design.compartments[index].id : componentId;
}

/** What the viewer shows: the saved version while comparing (with no selection), else the design. */
export function shownState(state) {
  const comparing = Boolean(state.ui?.comparing && state.version);
  return comparing
    ? { design: state.version, selection: null, comparing }
    : { design: state.design, selection: state.selection ?? null, comparing };
}

export function createViewer(container, store, { onDimensionStep } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps catalog colours faithful, rolls off highlights
  renderer.toneMappingExposure = 1;
  // three r186 removed PCFSoftShadowMap (it warns); PCFShadowMap is the soft Vogel-disk filter, softened by shadow.radius.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the wardrobe is static between rebuilds, so draw the map only then
  renderer.domElement.setAttribute('aria-label', CANVAS_LABEL);
  container.appendChild(renderer.domElement);

  // CSS2D positions each label from the layer's top-left, so the layer stays LTR on the RTL page.
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  labels.domElement.dir = 'ltr';
  container.appendChild(labels.domElement);

  const { scene, key, fill, floor, grid } = createScene();
  const environment = createEnvironment(renderer, scene, { grid, floor });
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery?.matches);
  Object.assign(controls, { enableDamping: !reducedMotion(), minDistance: 0.6, maxDistance: MAX_DISTANCE, maxPolarAngle: Math.PI / 2 - 0.02 });
  const onMotionChange = () => { controls.enableDamping = !reducedMotion(); };
  motionQuery?.addEventListener?.('change', onMotionChange);

  const materials = createMaterials(store.getState().catalog, { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  const hardware = createHardware?.() ?? null;
  const highlighter = createHighlighter(scene);
  const flasher = createFlasher(scene);
  const dimensions = createDimensions(scene, { onStep: (step) => onDimensionStep?.(step) });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#8a857c', transparent: true, opacity: 0.35, toneMapped: false });
  let group = null;
  let props = null;
  let ledLights = [];
  let hoveredId = null;
  let rendered = { design: null, doorsVisible: null, showClothes: null, propsDesign: null, selection: undefined, dimsKey: null };
  const shown = () => shownState(store.getState());

  // --- Door motion: openness (0 closed .. 1 open) follows ui.doorsOpen through a critically damped spring.
  let openness = 0;
  let velocity = 0;
  let lastFrame = performance.now();
  let moving = false;
  const targetOpenness = () => (store.getState().ui.doorsOpen ? 1 : 0);
  // The LED strips follow the doors like a door sensor (always on without doors).
  const updateLed = () => {
    if (!rendered.design) return;
    setLedLevel(ledLights, materials.led, ledLevel(rendered.design, store.getState().ui, openness));
  };
  // Path tracer, created below; overlays stay hidden while it renders.
  let tracer = null;
  const isRendering = () => Boolean(tracer?.rendering);
  const overlaysVisible = () => !moving && !isRendering();
  // Overlays copy the mesh transform when built, so they are rebuilt once the doors settle.
  const refreshOverlays = () => {
    const { design, selection } = shown();
    highlighter.setVisible(overlaysVisible());
    highlighter.update(group, design, selection);
    highlighter.setHover(group, design, hoveredId);
    dimensions.update(group, design, selection);
  };
  const stepDoors = (now) => {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (!group || !applyDoorMotion) return;
    const target = targetOpenness();
    if (openness === target && velocity === 0) return;
    if (reducedMotion()) {
      openness = target;
      velocity = 0;
    } else {
      const e0 = openness - target;
      const c = velocity + DOOR_OMEGA * e0;
      const decay = Math.exp(-DOOR_OMEGA * dt);
      openness = target + (e0 + c * dt) * decay;
      velocity = (velocity - DOOR_OMEGA * c * dt) * decay;
      if (Math.abs(openness - target) < 5e-4 && Math.abs(velocity) < 5e-3) {
        openness = target;
        velocity = 0;
      }
    }
    if (!moving) {
      moving = true;
      highlighter.setVisible(false); // hide stale outlines while the mesh moves
    }
    applyDoorMotion(group, openness);
    updateLed();
    renderer.shadowMap.needsUpdate = true;
    if (openness === target && velocity === 0) {
      moving = false;
      refreshOverlays();
    }
  };
  /** Jump the doors to their target pose (the path tracer bakes a static scene). */
  const snapDoors = () => {
    openness = targetOpenness();
    velocity = 0;
    moving = false;
    if (group && applyDoorMotion) applyDoorMotion(group, openness);
    updateLed();
    renderer.shadowMap.needsUpdate = true;
  };

  const rebuildProps = (design, show) => {
    if (props) {
      scene.remove(props);
      disposeProps?.(props);
      props = null;
    }
    if (!show || !buildProps) return;
    props = buildProps(design, { seed: PROPS_SEED });
    if (!props) return;
    props.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    scene.add(props);
    renderer.shadowMap.needsUpdate = true;
  };

  // --- Camera views: named poses, animated in the render loop (or jumped to when motion is reduced).
  let viewName = null;
  let animation = null; // { from, to, direction, start }
  const viewListeners = new Set();
  const setViewName = (name) => {
    if (name === viewName) return;
    viewName = name;
    viewListeners.forEach((listener) => listener(name));
  };
  const applyPose = ({ position, target }) => {
    camera.position.fromArray(position);
    controls.target.fromArray(target);
    controls.maxDistance = Math.max(MAX_DISTANCE, camera.position.distanceTo(controls.target) * 1.25);
    controls.update();
  };
  const currentPose = () => ({ position: camera.position.toArray(), target: controls.target.toArray() });
  const currentDirection = () => {
    const offset = camera.position.clone().sub(controls.target);
    return offset.lengthSq() > 1e-9 ? offset.normalize().toArray() : [...VIEWS.threeQuarter];
  };
  // OrbitControls keeps decaying drag momentum after a release. Settle it before a programmatic
  // move, or it keeps coasting the camera off the requested pose.
  const flushMomentum = () => {
    if (!controls.enableDamping) return;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
  };
  const moveTo = (pose, animate) => {
    flushMomentum();
    const direction = new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target)).normalize().toArray();
    if (!animate || reducedMotion()) {
      animation = null;
      applyPose(pose);
      return;
    }
    animation = { from: currentPose(), to: pose, direction, start: performance.now() };
  };
  const stepAnimation = (now) => {
    if (!animation) return;
    const t = Math.min((now - animation.start) / VIEW_MS, 1);
    applyPose(blendPose(animation.from, animation.to, easeInOut(t)));
    if (t >= 1) animation = null;
  };
  // Views frame the live design, also while a saved version is shown (so a size change stays visible).
  const dimensionsNow = () => store.getState().design.dimensions;
  const setView = (name, { animate = true } = {}) => {
    const pose = poseFor(store.getState().design, name, camera.fov, camera.aspect);
    if (!pose) return;
    setViewName(name);
    moveTo(pose, animate);
  };
  const fitView = ({ animate = true } = {}) => {
    moveTo(poseAlong(dimensionsNow(), animation?.direction ?? currentDirection(), camera.fov, camera.aspect), animate);
  };
  // Manual orbit/pan/zoom leaves the named view and cancels any running animation.
  const onControlsStart = () => {
    animation = null;
    setViewName(null);
  };
  controls.addEventListener('start', onControlsStart);
  // Any camera move during a render restarts its accumulation from the new viewpoint.
  const onControlsChange = () => tracer?.invalidate();
  controls.addEventListener('change', onControlsChange);

  // --- Path-traced render: the viewer stages the scene, the tracer bakes and accumulates it.
  const stageRender = (on, set) => {
    if (on) {
      snapDoors();
      flasher.clear();
      hoveredId = null;
      highlighter.setHover(group, shown().design, null);
    }
    key.visible = !on;
    fill.visible = !on;
    renderer.toneMappingExposure = on ? RENDER_EXPOSURE : 1; // the render set's lights are stronger than the live ones
    environment.setRenderSet(on ? set : null);
    // Prepare the raster fallback (shown while the tracer compiles or the camera moves) up front: this
    // converts the tracer's equirect environment for the raster materials here, not nested inside a
    // draw call, where the conversion's own passes would run out of texture units.
    if (on) renderer.compileAsync(scene, camera).catch(() => {});
    dimensions.setVisible(!on);
    labels.domElement.classList.toggle('viewer-labels--hidden', on);
    renderer.domElement.style.cursor = '';
    if (on) highlighter.setVisible(false);
    else refreshOverlays();
  };
  tracer = createPathTracer(renderer, scene, camera, {
    stage: stageRender,
    bounds: () => (group ? new THREE.Box3().setFromObject(group) : null),
  });

  const sync = (state) => {
    const { design, selection, comparing } = shownState(state);
    const { ui } = state;
    const showClothes = ui.showClothes !== false;
    const geometryChanged = design !== rendered.design || ui.doorsVisible !== rendered.doorsVisible;
    let sceneChanged = geometryChanged;
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        detachEdges(group); // before disposeWardrobe, which frees every geometry under the group
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsVisible: ui.doorsVisible, hardware });
      scene.add(group);
      attachEdges(group, edgeMaterial);
      ledLights = ledLightsOf(group);
      const inUse = new Set();
      group.traverse((object) => {
        if (!object.isMesh || object.userData.edge) return;
        object.castShadow = true;
        inUse.add(object.material);
      });
      // Fit the shadow camera around the closed AND fully open poses, then pose the doors.
      const shadowBox = new THREE.Box3();
      if (applyDoorMotion) {
        applyDoorMotion(group, 0);
        shadowBox.setFromObject(group);
        applyDoorMotion(group, 1);
        shadowBox.union(new THREE.Box3().setFromObject(group));
        applyDoorMotion(group, openness);
      } else {
        shadowBox.setFromObject(group);
      }
      fitShadowCamera(key, shadowBox);
      const center = shadowBox.getCenter(new THREE.Vector3());
      environment.focus(center.x, center.z);
      renderer.shadowMap.needsUpdate = true;
      // Hardware and prop materials are not cached, so retainOnly can never dispose them.
      materials.retainOnly(inUse);
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible };
      updateLed();
    }
    // First render: the default 3/4 view. Later size changes of the live design (e.g. the on-canvas
    // steppers) only refit, keeping the direction; showing a saved version never moves the camera.
    const { width, height, depth } = state.design.dimensions;
    const dimsKey = `${width}x${height}x${depth}`;
    if (rendered.dimsKey === null) setView('threeQuarter', { animate: false });
    else if (dimsKey !== rendered.dimsKey && !comparing) fitView({ animate: false });
    if (!comparing || rendered.dimsKey === null) rendered = { ...rendered, dimsKey };
    if (design !== rendered.propsDesign || showClothes !== rendered.showClothes) {
      rebuildProps(design, showClothes);
      rendered = { ...rendered, propsDesign: design, showClothes };
      sceneChanged = true;
    }
    if (geometryChanged || selection !== rendered.selection) {
      hoveredId = null;
      highlighter.setHover(group, design, null);
      highlighter.setVisible(overlaysVisible());
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
    }
    if (sceneChanged && isRendering()) tracer.restage();
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    labels.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
    if (rendered.design && clientWidth > 0 && clientHeight > 0) fitView({ animate: false });
    tracer.invalidate();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // No picking while a render runs or a saved version is shown (its parts are not in the design).
  const pickable = () => !isRendering() && !shown().comparing;
  const detachPicking = attachPicking({
    dom: renderer.domElement,
    camera,
    getTargets: () => (group && pickable() ? group.children : []),
    onPick: (hit) => { if (pickable()) store.select(componentAt(hit, shown().design)); },
    onHover: (hit) => {
      const { design, selection } = shown();
      const id = pickable() ? componentAt(hit, design) : null;
      renderer.domElement.style.cursor = id ? 'pointer' : '';
      const hovered = id && id !== selection?.id ? id : null;
      if (hovered === hoveredId) return;
      hoveredId = hovered;
      highlighter.setHover(group, design, hovered);
    },
  });
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    if (isRendering()) {
      lastFrame = now; // the doors stay at rest; no dt jump once the render ends
      if (openness !== targetOpenness()) tracer.restage(); // doors toggled mid-render: re-bake them at rest
      stepAnimation(now);
      controls.update();
      tracer.tick();
      labels.render(scene, camera);
      return;
    }
    stepDoors(now);
    stepAnimation(now);
    flasher.step(now);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
    setView,
    fitView,
    /** Switch the backdrop ('studio' | 'room'). Resolves to the backdrop in effect; the room loads lazily and never throws. */
    setBackdrop: (name) => environment.setBackdrop(name),
    /** The backdrop in effect: 'studio' | 'room'. */
    get backdrop() { return environment.backdrop; },
    /** The last backdrop load error (or null); the viewer stays in the studio when the room fails to load. */
    get backdropError() { return environment.lastError; },
    /** Door openness 0..1 (animated towards ui.doorsOpen). */
    get doorOpenness() { return openness; },
    /** LED level 0..1 (follows the doors; 1 without doors). */
    get ledLevel() { return rendered.design ? ledLevel(rendered.design, store.getState().ui, openness) : 0; },
    /** The current named view ('threeQuarter' | 'front' | 'side'), or null after a manual orbit. */
    get viewName() { return viewName; },
    /** Calls fn(viewName) whenever the named view changes (including to null). Returns unsubscribe. */
    subscribeView(fn) {
      viewListeners.add(fn);
      return () => viewListeners.delete(fn);
    },
    meshOf: (componentId) => group?.children.find((mesh) => mesh.userData.componentId === componentId) ?? null,
    /** Client (page) coordinates of a component's centre, for tests and tooling. */
    screenPointOf(componentId) {
      const mesh = this.meshOf(componentId);
      if (!mesh) return null;
      const projected = mesh.position.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
    },
    /**
     * Pulse an accent highlight (~1.2 s; steady with reduced motion) over advisory targets:
     * 'carcass', 'door:<doorId>', 'comp:<index>'. Returns how many parts it highlights.
     */
    flash(targets) {
      if (!group || isRendering()) return 0;
      return flasher.show(resolveFlashTargets(targets, rendered.design, group), { reducedMotion: reducedMotion() });
    },
    /** Parts currently flashing (0 once the pulse has ended). */
    get flashCount() { return flasher.count; },
    /**
     * Start a path-traced render (~400 samples). Resolves once accumulation has begun; progress
     * comes as onProgress(samples, total, compiling) and completion as onProgress(total, total, false).
     * Rejects with a Hebrew Error when the browser cannot path trace (no WebGL2 / float targets).
     */
    startRender: ({ onProgress } = {}) => tracer.start({ onProgress }),
    /** End the render and return to the live view. */
    stopRender: () => tracer.stop(),
    isRendering,
    /** Render n samples synchronously (tests: a hidden page pauses rAF). Returns { samples, total, compiling }. */
    stepRender: (n = 1) => tracer.step(n),
    /** Load and compile the path tracer in the background so the first render starts fast. Resolves false when unsupported. */
    prewarm: () => tracer.prewarm(),
    /** The canvas as a PNG data URL (the finished render while rendering, else the live view). */
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    dispose() {
      renderer.setAnimationLoop(null);
      unsubscribe();
      detachPicking();
      tracer.dispose();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      motionQuery?.removeEventListener?.('change', onMotionChange);
      viewListeners.clear();
      resizeObserver.disconnect();
      if (group) {
        detachEdges(group);
        disposeWardrobe(group);
      }
      if (props) {
        scene.remove(props);
        disposeProps?.(props);
        props = null;
      }
      hardware?.dispose?.();
      environment.dispose();
      edgeMaterial.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      highlighter.dispose();
      flasher.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
