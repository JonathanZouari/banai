// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select(). Selecting a part moves the camera to it; the camera is
// viewer-only and never enters the store.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

const BACKGROUND = '#eceeec';
const FOCUS_MS = 450;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.9);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
  grid.position.y = -0.0005;
  scene.add(grid);
  return scene;
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
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view. Every part is also listed under All parts in the Properties panel.');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: 14, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  let group = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null };

  /** The overview: the whole wardrobe from the front, a little to the right and above. */
  const overviewPose = (design) => {
    const { width, height, depth } = design.dimensions;
    const center = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
    const distance = (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.35;
    return { position: new THREE.Vector3(center.x + distance * 0.35, center.y + distance * 0.12, distance), target: center };
  };

  // --- Camera moves: eased in the render loop, or a jump when the user prefers reduced motion.
  let move = null; // { from: { position, target }, to: { position, target }, start, focus }
  const applyPose = ({ position, target }) => {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };
  const moveCamera = (to, { animate = true, focus = false } = {}) => {
    // Settle any orbit momentum first, or it keeps coasting the camera off the requested pose.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    if (!animate || reducedMotion()) {
      move = null;
      applyPose(to);
      return;
    }
    move = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, start: performance.now(), focus };
  };
  const stepMove = (now) => {
    if (!move) return;
    const t = Math.min((now - move.start) / FOCUS_MS, 1);
    const k = easeInOut(t);
    const { from, to } = move;
    applyPose({ position: from.position.clone().lerp(to.position, k), target: from.target.clone().lerp(to.target, k) });
    if (t >= 1) move = null;
  };
  // A manual orbit, pan or zoom takes over from a running move. OrbitControls fires 'start' on any press, even a
  // click, so only real input counts: a drag past the click tolerance (as picking.js) or the wheel.
  const DRAG_PX = 5;
  let press = null;
  const onPressDown = (event) => { press = { x: event.clientX, y: event.clientY }; };
  const onPressMove = (event) => {
    if (!press || event.buttons === 0) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_PX) move = null;
  };
  const onPressUp = () => { press = null; };
  const onWheel = () => { move = null; };
  renderer.domElement.addEventListener('pointerdown', onPressDown);
  renderer.domElement.addEventListener('pointermove', onPressMove);
  window.addEventListener('pointerup', onPressUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

  const fitCamera = (design, options) => moveCamera(overviewPose(design), options);

  /** World-space centre of a component: its meshes, or a compartment's interior (it has no mesh of its own). */
  const centreOf = (design, id) => {
    const box = new THREE.Box3();
    group?.children.forEach((mesh) => { if (mesh.userData.componentId === id) box.expandByObject(mesh); });
    if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
    const index = design.compartments.findIndex((compartment) => compartment.id === id);
    if (index < 0) return null;
    const frame = frameOf(design);
    const [x0, x1] = frame.ranges[index];
    return new THREE.Vector3(toM((x0 + x1) / 2), toM(frame.panel + frame.innerHeight / 2), toM(frame.innerCenterZ));
  };
  /** Pan so the component becomes the orbit centre; the camera keeps its direction and distance. */
  const focusOn = (design, id) => {
    const centre = centreOf(design, id);
    if (!centre) return;
    const target = move ? move.to.target : controls.target;
    const position = (move ? move.to.position : camera.position).clone().add(centre.clone().sub(target));
    moveCamera({ position, target: centre }, { focus: true });
  };

  const sync = (state) => {
    const { design, ui, selection } = state;
    const geometryChanged = design !== rendered.design || ui.doorsVisible !== rendered.doorsVisible;
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsVisible: ui.doorsVisible });
      scene.add(group);
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = design.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) fitCamera(design, { animate: false });
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey };
    }
    if (geometryChanged || selection !== rendered.selection) {
      // Only a newly selected part moves the camera: an edit to the selected one keeps the view.
      const newPick = selection?.id && selection.id !== rendered.selection?.id;
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
      if (newPick) focusOn(design, selection.id);
    }
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    labels.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const detachPicking = attachPicking({
    dom: renderer.domElement,
    camera,
    getTargets: () => (group ? group.children : []),
    onPick: (hit) => store.select(componentAt(hit, store.getState().design)),
    onHover: (hit) => { renderer.domElement.style.cursor = hit?.object.userData.componentId ? 'pointer' : ''; },
  });
  // A double click on empty background (no wardrobe part under the pointer) returns to the overview.
  const raycaster = new THREE.Raycaster();
  const onDoubleClick = (event) => {
    // While the camera eases to a part, the part slides from under the pointer: a double click on it is not one on
    // the background. (A double click on the background selects nothing, so no focus move is running then.)
    if (!group || move?.focus) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObjects(group.children, false).length) return;
    fitCamera(store.getState().design);
  };
  renderer.domElement.addEventListener('dblclick', onDoubleClick);
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop(() => {
    stepMove(performance.now());
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
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
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('pointerdown', onPressDown);
      renderer.domElement.removeEventListener('pointermove', onPressMove);
      window.removeEventListener('pointerup', onPressUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      if (group) disposeWardrobe(group);
      highlighter.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
