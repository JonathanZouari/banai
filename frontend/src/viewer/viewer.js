// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { VIEWS, blendPose, easeInOut, poseAlong, poseFor } from './camera.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { attachEdges, detachEdges } from './edges.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { fitShadowCamera } from './shadow.js';

const BACKGROUND = '#eceeec';
const VIEW_MS = 300;
const MAX_DISTANCE = 14;
const FLOOR_SIZE = 12; // m, same as the grid
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
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6; // PCF blur in texels: this is what makes the shadow soft
  scene.add(key, key.target); // the target must be in the scene for the light to aim at it
  const fill = new THREE.DirectionalLight('#ffffff', 0.9);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
  grid.position.y = -0.0005;
  scene.add(grid);
  const floor = createFloor();
  scene.add(floor);
  return { scene, key, floor };
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

export function createViewer(container, store) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // three r186 removed PCFSoftShadowMap (it warns); PCFShadowMap is the soft Vogel-disk filter, softened by shadow.radius.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the wardrobe is static between rebuilds, so draw the map only then
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const { scene, key, floor } = createScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery?.matches);
  Object.assign(controls, { enableDamping: !reducedMotion(), minDistance: 0.6, maxDistance: MAX_DISTANCE, maxPolarAngle: Math.PI / 2 - 0.02 });
  const onMotionChange = () => { controls.enableDamping = !reducedMotion(); };
  motionQuery?.addEventListener?.('change', onMotionChange);

  const materials = createMaterials(store.getState().catalog);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#8a857c', transparent: true, opacity: 0.35 });
  let group = null;
  let hoveredId = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null };

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

  const sync = (state) => {
    const { design, ui, selection } = state;
    const geometryChanged = design !== rendered.design || ui.doorsVisible !== rendered.doorsVisible;
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        detachEdges(group); // before disposeWardrobe, which frees every geometry under the group
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsVisible: ui.doorsVisible });
      scene.add(group);
      attachEdges(group, edgeMaterial);
      group.children.forEach((mesh) => { mesh.castShadow = true; });
      fitShadowCamera(key, new THREE.Box3().setFromObject(group));
      renderer.shadowMap.needsUpdate = true;
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = design.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) setView('threeQuarter', { animate: false });
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey };
    }
    if (geometryChanged || selection !== rendered.selection) {
      hoveredId = null;
      highlighter.setHover(group, design, null);
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
    }
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    labels.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
    if (rendered.design && clientWidth > 0 && clientHeight > 0) fitView({ animate: false });
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const detachPicking = attachPicking({
    dom: renderer.domElement,
    camera,
    getTargets: () => (group ? group.children : []),
    onPick: (hit) => store.select(componentAt(hit, store.getState().design)),
    onHover: (hit) => {
      const { design, selection } = store.getState();
      const id = componentAt(hit, design);
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
    stepAnimation(performance.now());
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
    dispose() {
      renderer.setAnimationLoop(null);
      unsubscribe();
      detachPicking();
      controls.removeEventListener('start', onControlsStart);
      motionQuery?.removeEventListener?.('change', onMotionChange);
      viewListeners.clear();
      resizeObserver.disconnect();
      if (group) {
        detachEdges(group);
        disposeWardrobe(group);
      }
      edgeMaterial.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      highlighter.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
