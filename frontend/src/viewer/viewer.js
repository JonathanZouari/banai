// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select(). The camera is view state: it is never part of the design or the store.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { compartmentPose, createFlight, overviewPose } from './cameraFocus.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';
import { createRoomScene } from '../room/roomScene.js';
import { roomView } from '../room/views.js';

const BACKGROUND = '#eceeec';
const BASE_FOV = 40;
const BASE_MAX_DISTANCE = 14;

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const hemi = new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.9);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
  grid.position.y = -0.0005;
  scene.add(grid);
  return { scene, lights: { hemi, key, fill }, grid };
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

/** `room` (optional): the room setup (room/roomState.js), shown around the wardrobe when enabled. */
export function createViewer(container, store, { units, room = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view. Every part is also listed under All parts in the Properties panel.');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const { scene, lights, grid } = createScene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: BASE_MAX_DISTANCE, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  let group = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null, focusKey: null, room: null };
  const flight = createFlight(camera, controls);
  controls.addEventListener('start', () => flight.cancel()); // the customer took the camera: stop moving it
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Decoration only: the room never reads or writes the design, and is never picked as a part.
  const roomScene = room ? createRoomScene({ scene, lights, grid }) : null;

  const fitCamera = (design) => {
    const { target, position } = overviewPose(design, camera.fov);
    flight.cancel();
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  /** Selecting a compartment centres the camera on it; any other selection leaves the camera alone. */
  const focusSelection = (design, selection) => {
    const focusKey = selection?.kind === 'compartment' ? selection.id : null;
    if (focusKey === rendered.focusKey) return; // an edit re-resolves the selection: do not yank the camera
    rendered = { ...rendered, focusKey };
    const pose = focusKey && compartmentPose(design, focusKey, { position: camera.position, target: controls.target });
    if (pose) flight.start(pose, reducedMotion());
  };

  const showOverview = () => {
    flight.start(overviewPose(store.getState().design, camera.fov), reducedMotion());
    rendered = { ...rendered, focusKey: null };
  };

  const sync = (state) => {
    const { design, ui, selection } = state;
    const geometryChanged = design !== rendered.design || ui.doorsVisible !== rendered.doorsVisible;
    let sizeChanged = false;
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
      sizeChanged = dimsKey !== rendered.dimsKey;
      if (sizeChanged && !room?.get().enabled) fitCamera(design);
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey };
    }
    if (roomScene && (geometryChanged || room.get() !== rendered.room)) syncRoom(design, sizeChanged);
    if (geometryChanged || selection !== rendered.selection) {
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection, units?.get());
      rendered = { ...rendered, selection };
      focusSelection(design, selection);
    }
  };

  // The room follows the design's size and the room setup. Entering it moves the camera inside;
  // leaving it frames the wardrobe exactly as before.
  function syncRoom(design, sizeChanged) {
    const setup = room.get();
    const wasOn = rendered.room?.enabled === true;
    const box = roomScene.update(design, setup);
    // The room's layout (not its look): when it changes, the chosen view is framed again.
    const layoutKey = JSON.stringify([setup.size, setup.wardrobeAt, setup.preset]);
    const relayout = layoutKey !== rendered.roomLayout;
    rendered = { ...rendered, room: setup, roomLayout: layoutKey };
    if (box && !wasOn) showRoomView(setup.view, { animate: false });
    else if (box && (sizeChanged || relayout)) showRoomView(setup.view);
    if (!box && wasOn) {
      flight.cancel();
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      controls.maxDistance = BASE_MAX_DISTANCE;
      fitCamera(design);
    }
  }

  // Room views use the viewer's one camera flight (cameraFocus.js), which also eases the lens.
  const toVector = ({ x, y, z }) => new THREE.Vector3(toM(x), toM(y), toM(z));

  function showRoomView(view, { animate = true } = {}) {
    const box = roomScene?.box;
    if (!box) return;
    const pose = roomView(view, { design: store.getState().design, box, placed: roomScene.furniture, aspect: camera.aspect });
    const to = { position: toVector(pose.position), target: toVector(pose.target), fov: pose.fov };
    controls.maxDistance = Math.max(BASE_MAX_DISTANCE, to.position.distanceTo(to.target) * 1.4);
    flight.start(to, !animate || reducedMotion());
  }

  // A panel over one side of the view (the Room panel) narrows the visible frame: the camera is
  // framed for the uncovered part only (view offset), so nothing important hides behind it.
  let inset = { left: 0, right: 0, bottom: 0 };
  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    labels.setSize(clientWidth, clientHeight);
    const visible = Math.max(clientWidth - inset.left - inset.right, clientWidth * 0.45);
    const tall = Math.max(clientHeight - inset.bottom, clientHeight * 0.4);
    camera.aspect = visible / Math.max(tall, 1);
    if (inset.left || inset.right || inset.bottom) {
      camera.setViewOffset(visible, tall, -Math.min(inset.left, clientWidth - visible), 0, clientWidth, clientHeight);
    } else {
      camera.clearViewOffset();
    }
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
    onDoubleClick: (hit) => { if (!hit) showOverview(); }, // double-click on empty background: back to the general view
  });
  const unsubscribe = store.subscribe(sync);
  // The unit only changes the label text: redraw the labels, never the wardrobe.
  const unsubscribeUnits = units?.subscribe(() => {
    const { design, selection } = store.getState();
    dimensions.update(group, design, selection, units.get());
  });
  const unsubscribeRoom = room ? room.subscribe(() => sync(store.getState())) : () => {};
  sync(store.getState());

  renderer.setAnimationLoop((now) => {
    flight.step(now);
    controls.update();
    roomScene?.frame(camera);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
    /** Frame a room view ('doorway' | 'bed' | 'plan' | 'overview'); does nothing with the room off. */
    showRoomView,
    /** Pixels covered by a panel (one side, or the bottom); the camera frames the rest. */
    setFrameInset(next) {
      const bottom = next.bottom ?? 0;
      if (next.left === inset.left && next.right === inset.right && bottom === inset.bottom) return;
      inset = { left: next.left, right: next.right, bottom };
      resize();
      if (room?.get().enabled) showRoomView(room.get().view, { animate: false });
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
      unsubscribeUnits?.();
      unsubscribeRoom();
      roomScene?.dispose();
      detachPicking();
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
