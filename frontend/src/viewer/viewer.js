// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select(). While `ui.comparing` is on it shows the saved `version`
// instead of the design (read defensively: older stores have neither).
// Moving parts (doors, drawers, trouser racks, pull-down rails) follow ui.doorsOpen and the selection
// through the motion driver; setMotion() pins them to the deterministic open sequence (video).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { ledLevel, ledLightsOf, setLedLevel } from './builders/inserts.js';
import { VIEWS, blendPose, easeInOut, poseAlong, poseFor } from './camera.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createRoomOverlay } from './room.js';
import { createFigure } from './figure.js';
import { attachEdges, detachEdges } from './edges.js';
import { createEnvironment } from './environment.js';
import { createFlasher, resolveFlashTargets } from './flash.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { doorsInScene, motionAt, pullOutAccess } from './motion.js';
import { createMotionDriver } from './motionDriver.js';
import { createPathTracer } from './pathtrace.js';
import { attachPicking } from './picking.js';
import { attachDragging } from './dragTool.js';
import { attachMeasuring } from './measureTool.js';
import { createHandles } from './handles3d.js';
import { handlesFor, roomShift } from './resizeRules.js';
import { applyPullOuts } from './pullOuts.js';
import { fitShadowCamera } from './shadow.js';

RectAreaLightUniformsLib.init(); // LED strips and the render's window light are area lights

// Optional modules from the builders workstream: a missing one never breaks the viewer.
const optional = import.meta.glob(['./hardware.js', './doorMotion.js', './props.js'], { eager: true });
const { createHardware } = optional['./hardware.js'] ?? {};
const { applyDoorMotion } = optional['./doorMotion.js'] ?? {};
const { buildProps, disposeProps } = optional['./props.js'] ?? {};

const BACKGROUND = '#efe8dc'; // as STUDIO_BACKGROUND: a warm studio
const RENDER_EXPOSURE = 0.85;
const VIEW_MS = 300;
const MAX_DISTANCE = 14;
const FLOOR_SIZE = 12; // m, same as the grid
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
  const grid = new THREE.GridHelper(12, 24, '#cdbfae', '#ddd2c3'); // pencil on warm paper
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

export function createViewer(container, store, { onDimensionStep, onDragError, onMeasureChange } = {}) {
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
  const room = createRoomOverlay(scene); // the customer's site: door swings, pull-outs, the niche, wall obstacles
  const figure = createFigure(scene); // a 170 cm scale figure, on request (ui.showFigure)
  let figureWanted = false;
  const showFigure = (on) => {
    figure.setVisible(on);
    renderer.shadowMap.needsUpdate = true;
  };
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#8a857c', transparent: true, opacity: 0.35, toneMapped: false });
  let group = null;
  let props = null;
  let ledLights = [];
  let hoveredId = null;
  let rendered = { design: null, doorsVisible: null, showClothes: null, propsDesign: null, selection: undefined, dimsKey: null };
  const shown = () => shownState(store.getState());

  // --- Motion: doors (openness 0 closed .. 1 open) and pull-outs follow ui.doorsOpen and the selection
  // on critically damped springs, sequenced by the driver; setMotion() pins them instead.
  const driver = createMotionDriver();
  let lastFrame = performance.now();
  let moving = false;
  // The LED strips follow the doors like a door sensor (always on without doors).
  const updateLed = () => {
    if (!rendered.design) return;
    setLedLevel(ledLights, materials.led, ledLevel(rendered.design, store.getState().ui, driver.doors));
  };
  // Path tracer, created below; overlays stay hidden while it renders.
  let tracer = null;
  const isRendering = () => Boolean(tracer?.rendering);
  let capture = null; // video capture (render/video.js): saved camera and pixel ratio while frames are drawn on demand
  let traced = null; // path-traced capture: { motion } of the last baked frame
  let dragActive = false; // a drag (dragTool.js) moves parts in place: their outlines would stay behind
  let keepCamera = false; // while a stretch is dropped: no refit to the new size, the camera stays (onResized shifts it)
  const overlaysVisible = () => !moving && !dragActive && !isRendering() && !capture;
  // Overlays copy the mesh transform when built, so they are rebuilt once the doors settle.
  const refreshOverlays = () => {
    const { design, selection } = shown();
    highlighter.setVisible(overlaysVisible());
    highlighter.update(group, design, selection);
    highlighter.setHover(group, design, hoveredId);
    dimensions.update(group, design, selection);
    updateHandles();
  };
  /** Pose the doors, the pull-outs and the clothes they carry from the driver. */
  const poseParts = () => {
    if (!group) return;
    applyDoorMotion?.(group, driver.doors);
    applyPullOuts(group, driver.opennessOf, props);
    updateLed();
    renderer.shadowMap.needsUpdate = true;
  };
  const stepMotion = (now) => {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (!group) return;
    const changed = driver.step(dt, { reducedMotion: reducedMotion() });
    if (!changed && !moving) return;
    if (!moving) {
      moving = true;
      highlighter.setVisible(false); // hide stale outlines while the meshes move
    }
    poseParts();
    if (driver.settled) {
      moving = false;
      refreshOverlays();
    }
  };
  /** Jump every moving part to its end pose (the path tracer bakes a static scene). */
  const snapMotion = () => {
    driver.snap();
    moving = false;
    poseParts();
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
  // With the figures shown, the views frame the household beside the wardrobe too.
  const framed = () => {
    const { design } = store.getState();
    if (!figureWanted) return design.dimensions;
    const { right, height } = figure.extent(design);
    return { ...design.dimensions, width: Math.max(design.dimensions.width, right), height: Math.max(design.dimensions.height, height) };
  };
  const setView = (name, { animate = true } = {}) => {
    const pose = poseFor({ dimensions: framed() }, name, camera.fov, camera.aspect);
    if (!pose) return;
    setViewName(name);
    moveTo(pose, animate);
  };
  const fitView = ({ animate = true } = {}) => {
    moveTo(poseAlong(framed(), animation?.direction ?? currentDirection(), camera.fov, camera.aspect), animate);
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
      snapMotion();
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
    room.setVisible(!on);
    handles.setVisible(!on);
    measure.setVisible(!on);
    showFigure(!on && figureWanted);
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
    driver.setInputs({ doorsOpen: ui.doorsOpen, selectedId: selection?.id ?? null });
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        detachEdges(group); // before disposeWardrobe, which frees every geometry under the group
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsVisible: ui.doorsVisible, hardware });
      room.update(design);
      figure.update(design);
      scene.add(group);
      attachEdges(group, edgeMaterial);
      ledLights = ledLightsOf(group);
      const inUse = new Set();
      group.traverse((object) => {
        if (!object.isMesh || object.userData.edge) return;
        object.castShadow = true;
        inUse.add(object.material);
      });
      driver.configure(pullOutAccess(design, { doorsVisible: ui.doorsVisible }), { hasDoors: doorsInScene(design, ui) });
      // Fit the shadow camera around the closed AND fully open poses (doors, drawers out, rails down);
      // the parts are posed from the driver below, once the clothes are built too.
      const poseAll = (openness) => {
        applyDoorMotion?.(group, openness);
        applyPullOuts(group, () => openness);
      };
      poseAll(0);
      const shadowBox = new THREE.Box3().setFromObject(group);
      poseAll(1);
      shadowBox.union(new THREE.Box3().setFromObject(group));
      fitShadowCamera(key, shadowBox);
      const center = shadowBox.getCenter(new THREE.Vector3());
      environment.focus(center.x, center.z);
      renderer.shadowMap.needsUpdate = true;
      // Hardware and prop materials are not cached, so retainOnly can never dispose them.
      materials.retainOnly(inUse);
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible };
    }
    // First render: the default 3/4 view. Later size changes of the live design (e.g. the on-canvas
    // steppers) only refit, keeping the direction; showing a saved version never moves the camera.
    const { width, height, depth } = state.design.dimensions;
    const dimsKey = `${width}x${height}x${depth}`;
    if (rendered.dimsKey === null) setView('threeQuarter', { animate: false });
    else if (dimsKey !== rendered.dimsKey && !comparing && !keepCamera) fitView({ animate: false }); // a stretch keeps the view
    if (!comparing || rendered.dimsKey === null) rendered = { ...rendered, dimsKey };
    if (design !== rendered.propsDesign || showClothes !== rendered.showClothes) {
      rebuildProps(design, showClothes);
      rendered = { ...rendered, propsDesign: design, showClothes };
      sceneChanged = true;
    }
    if ((ui.showFigure === true) !== figureWanted) {
      figureWanted = ui.showFigure === true;
      if (!isRendering() && !capture) {
        showFigure(figureWanted);
        if (rendered.dimsKey !== null && !comparing) fitView(); // bring the household into the frame, or leave it
      }
    }
    if (sceneChanged) poseParts();
    if (geometryChanged || selection !== rendered.selection) {
      hoveredId = null;
      highlighter.setHover(group, design, null);
      highlighter.setVisible(overlaysVisible());
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
    }
    if (sceneChanged && isRendering()) tracer.restage();
    updateHandles();
  };

  const resize = () => {
    if (capture) return; // the capture keeps its fixed video size
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
  // Measuring (ADR-040): with the ruler on, a press draws a line; nothing is picked or dragged meanwhile.
  const measure = attachMeasuring({
    dom: renderer.domElement, camera, controls, scene,
    getTargets: () => [group, room.group, floor].filter(Boolean),
    isEnabled: () => !isRendering() && !capture && !shown().comparing,
    onChange: (state) => onMeasureChange?.(state),
  });
  // Lines measure the design as it was: another design (an edit, an undo, a drag, a proposal) clears them, and a
  // comparison hides them.
  let measuredDesign = store.getState().design;
  store.subscribe((state) => {
    if (state.design !== measuredDesign) {
      measuredDesign = state.design;
      if (measure.lines.length || measure.drawing) measure.clear();
    }
    measure.setVisible(!shownState(state).comparing && !isRendering() && !capture);
  });
  const pickable = () => !isRendering() && !capture && !shown().comparing && !measure.active;
  // The room is drawn around the wardrobe: after the wardrobe moves `mm` along its wall the camera moves with the
  // room, so the room stays put on screen and the wardrobe is where it was dropped.
  const shiftCamera = (dxMm, dzMm = 0) => {
    camera.position.x += dxMm / 1000;
    camera.position.z += dzMm / 1000;
    controls.target.x += dxMm / 1000;
    controls.target.z += dzMm / 1000;
    controls.update();
  };
  const followWardrobe = (mm) => shiftCamera(-mm);
  // Stretch handles (ADR-039 stage 2): on the selected wardrobe, drawer or insert, on a clicked obstacle, and on
  // the room's walls. `activeObstacle` is the obstacle whose handles show (a click on it; a pick elsewhere clears it).
  const handles = createHandles(scene);
  let activeObstacle = null;
  let obstacleList = null;
  const updateHandles = () => {
    if (dragActive) return; // the dragged handle stays; the drop rebuilds them
    const { design, selection, comparing } = shown();
    if (design.site?.obstacles !== obstacleList) { // another list (an edit, an undo, a project): no stale handles
      obstacleList = design.site?.obstacles ?? null;
      if (activeObstacle && !obstacleList?.[activeObstacle.index]) activeObstacle = null;
    }
    handles.update(comparing ? [] : handlesFor(design, selection, activeObstacle));
    handles.setVisible(overlaysVisible() && !capture && !isRendering());
  };
  // Drag (ADR-039): the selected part, or any obstacle or opening, along its allowed line. When the wardrobe moves
  // along its wall the room is redrawn around it, so the camera moves with the room and nothing jumps.
  const dragging = attachDragging({
    dom: renderer.domElement, camera, controls, store,
    getWardrobe: () => group, getRoom: () => room.group,
    isEnabled: () => pickable() && driver.settled, // never while doors or drawers move: their pose is not settled
    getExtras: (target) => (target.kind === 'wardrobe' && props ? [props] : []), // the clothes go with the wardrobe
    onPreview: () => { renderer.shadowMap.needsUpdate = true; },
    onError: (error) => onDragError?.(error),
    onStart: () => {
      dragActive = true;
      highlighter.setVisible(false);
      dimensions.setVisible(false); // dimension lines would stay behind what moves
    },
    onEnd: () => {
      dragActive = false;
      dimensions.setVisible(true);
      refreshOverlays();
      updateHandles();
    },
    onWardrobeMoved: (mm) => followWardrobe(mm),
    handles,
    onActivate: (target) => {
      activeObstacle = target;
      obstacleList = store.getState().design.site?.obstacles ?? null;
      updateHandles();
    },
    // After a stretch the room may be redrawn around the wardrobe: the camera moves so the scene stays still.
    onDrop: (dropping) => { keepCamera = dropping; },
    onResized: (before, after, spec, value) => {
      const [dx, dz] = spec.shift ? spec.shift(value) : roomShift(before, after, spec.anchor, value);
      if (dx || dz) shiftCamera(dx, dz);
    },
  });
  const detachPicking = attachPicking({
    dom: renderer.domElement,
    camera,
    // Parts may have moved since the last frame (setMotion): raycast against their current pose.
    getTargets: () => {
      if (!group || !pickable()) return [];
      group.updateMatrixWorld();
      return group.children;
    },
    onPick: (hit) => {
      if (!pickable() || dragging.tookPress) return; // a press on a draggable thing or a handle is not a pick
      activeObstacle = null; // a pick anywhere else hides an obstacle's handles
      store.select(componentAt(hit, shown().design));
      updateHandles();
    },
    onHover: (hit) => {
      const { design, selection } = shown();
      const id = pickable() ? componentAt(hit, design) : null;
      renderer.domElement.style.cursor = dragging.grabbable ? 'grab' : id ? 'pointer' : '';
      const hovered = id && id !== selection?.id ? id : null;
      if (hovered === hoveredId) return;
      hoveredId = hovered;
      highlighter.setHover(group, design, hovered);
    },
  });
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop(() => {
    if (capture) return; // captureFrame() draws every frame of a video
    const now = performance.now();
    if (isRendering()) {
      lastFrame = now; // the moving parts stay at rest; no dt jump once the render ends
      if (!driver.settled) tracer.restage(); // doors toggled (or a part selected) mid-render: re-bake at rest
      stepAnimation(now);
      controls.update();
      tracer.tick();
      labels.render(scene, camera);
      return;
    }
    stepMotion(now);
    stepAnimation(now);
    flasher.step(now);
    handles.face(camera);
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
    /** Door openness 0..1 (animated towards ui.doorsOpen, or held by setMotion). */
    get doorOpenness() { return driver.doors; },
    /** Openness 0..1 of every pull-out (drawers, trouser racks, pull-down rails): { componentId: openness }. */
    get pullOutOpenness() { return driver.pullOuts(); },
    /** Whether setMotion() holds the moving parts (until releaseMotion()). */
    get motionPinned() { return driver.pinned; },
    /**
     * Pose every moving part at time t (0..1) of the open sequence (motion.js motionAt): the doors
     * open, then the drawers and trouser racks slide out and the pull-down rails come down; t back
     * to 0 closes. The parts stay there, ignoring the store, until releaseMotion(). immediate (the
     * default) poses them now, deterministically, without the springs; immediate: false lets the
     * springs carry them there. Returns the openness per category: { doors, drawers, trousers, pulldown }.
     */
    setMotion(t, { immediate = true } = {}) {
      driver.pin(t, { immediate });
      if (immediate && group) {
        moving = false;
        poseParts();
        if (isRendering()) tracer.restage();
        else refreshOverlays();
      }
      return motionAt(t);
    },
    /** Hand the moving parts back to the store (ui.doorsOpen and the selection); they spring back from where they are. */
    releaseMotion() {
      driver.release();
    },
    /** Render one frame of the live view now, as posed (frame capture; a hidden page pauses rAF). False while path tracing. */
    renderFrame() {
      if (isRendering()) return false;
      renderer.render(scene, camera);
      labels.render(scene, camera);
      return true;
    },
    /**
     * Video capture (render/video.js): a fixed-size view, without labels or highlights, whose frames are
     * drawn only by captureFrame(). endCapture() gives back the user's camera, size and moving parts.
     */
    beginCapture({ width, height }) {
      if (capture || isRendering() || !group) return false;
      capture = { pixelRatio: renderer.getPixelRatio(), position: camera.position.toArray(), target: controls.target.toArray() };
      animation = null;
      flasher.clear();
      hoveredId = null;
      highlighter.setHover(group, shown().design, null);
      highlighter.setVisible(false);
      dimensions.setVisible(false);
      room.setVisible(false);
      handles.setVisible(false);
      measure.setVisible(false);
      showFigure(false);
      labels.domElement.classList.add('viewer-labels--hidden');
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false); // the drawing buffer only; the page layout stays
      renderer.domElement.style.objectFit = 'contain'; // show the true frame, letterboxed, while it records
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      return true;
    },
    /** Draw one capture frame: the camera at `pose` ({ position, target }, metres), the parts at sequence time `motion`. */
    captureFrame({ pose, motion }) {
      if (!capture) return false;
      driver.pin(motion, { immediate: true });
      moving = false;
      poseParts();
      camera.position.fromArray(pose.position);
      controls.target.fromArray(pose.target);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      return true;
    },
    /**
     * A path-traced capture: beginCapture() plus the path tracer, compiled and staged. Resolves true when ready;
     * rejects with the tracer's Hebrew error (and leaves the live view as it was).
     */
    async beginTracedCapture({ width, height, timeoutMs = 120_000 }) {
      if (!this.beginCapture({ width, height })) return false;
      try {
        await tracer.start({});
        const deadline = performance.now() + timeoutMs;
        while (tracer.progress().compiling) {
          if (performance.now() > deadline) throw new Error('מנוע הרינדור לא סיים להתכונן בזמן.');
          await new Promise((resolve) => { setTimeout(resolve, 100); });
        }
        if (!isRendering()) throw new Error('הרינדור הופסק.');
        traced = { motion: null };
        return true;
      } catch (error) {
        tracer.stop();
        this.endCapture();
        throw error;
      }
    },
    /**
     * One path-traced capture frame: re-bake when the parts moved since the last frame (otherwise only the camera
     * changed), then trace `samples` full samples. Returns the samples reached.
     */
    captureTracedFrame({ pose, motion, samples }) {
      if (!capture || !traced) return 0;
      camera.position.fromArray(pose.position);
      controls.target.fromArray(pose.target);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      if (motion !== traced.motion) {
        driver.pin(motion, { immediate: true });
        moving = false;
        poseParts();
        tracer.restage(); // a new bake from this camera; accumulation starts over
        traced.motion = motion;
      } else {
        tracer.invalidate();
      }
      return tracer.step(samples).samples;
    },
    endCapture() {
      if (!capture) return;
      if (traced) {
        traced = null;
        tracer.stop();
      }
      const saved = capture;
      capture = null;
      renderer.setPixelRatio(saved.pixelRatio);
      renderer.domElement.style.objectFit = '';
      camera.position.fromArray(saved.position);
      controls.target.fromArray(saved.target);
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
      controls.update();
      driver.release();
      dimensions.setVisible(true);
      room.setVisible(true);
      showFigure(figureWanted);
      updateHandles();
      measure.setVisible(true);
      labels.domElement.classList.remove('viewer-labels--hidden');
      refreshOverlays();
    },
    get capturing() { return capture !== null; },
    /** LED level 0..1 (follows the doors; 1 without doors). */
    get ledLevel() { return rendered.design ? ledLevel(rendered.design, store.getState().ui, driver.doors) : 0; },
    /** The current named view ('threeQuarter' | 'front' | 'side'), or null after a manual orbit. */
    get viewName() { return viewName; },
    /** Calls fn(viewName) whenever the named view changes (including to null). Returns unsubscribe. */
    subscribeView(fn) {
      viewListeners.add(fn);
      return () => viewListeners.delete(fn);
    },
    meshOf: (componentId) => group?.children.find((mesh) => mesh.userData.componentId === componentId) ?? null,
    /** Test hook: whether the scale figure is in the scene now. */
    get figureShown() { return figure.group.visible; },
    /** After an arrow key moved the wardrobe `mm` along its wall: the camera stays with the room. */
    followWardrobe: (mm) => followWardrobe(mm),
    /** Test hook: client coordinates of a stretch handle by key ('wardrobe:right', 'wall:1', ...), or null. */
    screenPointOfHandle(key) {
      const item = handles.group.children.find((c) => c.userData.handle?.key === key);
      if (!item || !handles.group.visible) return null;
      const p = item.getWorldPosition(new THREE.Vector3()).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    /** Test hook: whether the doors and pull-outs have stopped moving (drags wait for it). */
    get settled() { return driver.settled; },
    /** Test hook: the stretch handles shown now (their keys). */
    get handleKeys() { return handles.group.children.map((c) => c.userData.handle?.key); },
    /** Test hook: client coordinates of a point in the viewer's frame (mm). */
    screenPointOfWorld([x, y, z]) {
      const p = new THREE.Vector3(x / 1000, y / 1000, z / 1000).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    /** The ruler (ADR-040): on or off, the lines kept so far, and clearing them. */
    setMeasuring: (on) => measure.setActive(on),
    get measuring() { return measure.active; },
    get measurements() { return measure.lines; },
    clearMeasurements: () => measure.clear(),
    /** Test hook: whether a drag is moving something now. */
    get dragging() { return dragging.dragging; },
    /**
     * Test hook: client coordinates of a drag target's centre: { kind: 'obstacle', index } or { kind: 'opening',
     * index } in the room, or a component id.
     */
    screenPointOfTarget(target) {
      let object = null;
      if (typeof target === 'string') object = this.meshOf(target);
      else if (target.kind === 'obstacle') room.group.traverse((n) => { if (n.userData.obstacleIndex === target.index) object = n; });
      else if (target.kind === 'opening') room.group.traverse((n) => { if (!object && /^room-(door|window)-(\d+)$/.exec(n.name)?.[2] === String(target.index)) object = n; });
      if (!object) return null;
      object.updateMatrixWorld();
      const centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((centre.x + 1) / 2) * rect.width, y: rect.top + ((1 - centre.y) / 2) * rect.height };
    },
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
      dragging.dispose();
      handles.dispose();
      measure.dispose();
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
      room.dispose();
      figure.dispose();
      flasher.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
