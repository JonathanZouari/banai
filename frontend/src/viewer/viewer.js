// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildBackdrop, disposeBackdrop } from './backdrop.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

const BACKGROUND = '#eceeec';
const ROOM_EXTRA_WIDTH = 2400; // mm of furniture beside the wardrobe that the camera also frames

// Photographic look: filmic tone mapping, soft image-based light from a neutral room (reflections
// on gloss and metal), a warm "window" sun that casts soft shadows and a cool fill from the other side.
const SUN_OFFSET = new THREE.Vector3(-3.2, 4.6, 4.2);

function createScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.3;
  scene.add(new THREE.HemisphereLight('#fffaf2', '#cbbfae', 0.55));
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.name = 'sun';
  key.position.copy(SUN_OFFSET);
  // The shadow map is redrawn only when the scene changes (see shadowMap.needsUpdate).
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 0.5, far: 20 });
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#e6eeff', 0.5);
  fill.position.set(4, 2.5, 5);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
  grid.position.y = -0.0005;
  grid.name = 'grid';
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view. Every part is also listed under All parts in the Properties panel.');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const scene = createScene(renderer);
  const sun = scene.getObjectByName('sun');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: 14, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  let group = null;
  let room = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null, roomKey: null };

  // The decorative room follows the wardrobe size; the floor grid shows only without one.
  // Returns true when the room or the wardrobe size changed (the camera then re-fits).
  const syncBackdrop = (design, kind) => {
    const roomKey = `${kind}:${rendered.dimsKey}`;
    if (roomKey === rendered.roomKey) return false;
    if (room) {
      scene.remove(room);
      disposeBackdrop(room);
    }
    room = buildBackdrop(kind, design);
    if (room) scene.add(room);
    renderer.shadowMap.needsUpdate = true;
    scene.getObjectByName('grid').visible = room === null;
    rendered = { ...rendered, roomKey };
    return true;
  };

  // With a room backdrop the shot widens to take in the furniture beside the wardrobe.
  const fitCamera = (design, withRoom) => {
    const { height, depth } = design.dimensions;
    const width = design.dimensions.width + (withRoom ? ROOM_EXTRA_WIDTH : 0);
    const center = new THREE.Vector3(toM(width / 2), toM(height * (withRoom ? 0.54 : 0.5)), toM(-depth / 2));
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // A room is framed like a catalogue photo: fit the width for the panel's aspect, eye level, less floor.
    const distance = withRoom
      ? Math.max(toM(height) / (2 * tan), toM(width) / (2 * tan * Math.max(camera.aspect, 0.5))) * 1.18
      : (toM(Math.max(width, height)) / (2 * tan)) * 1.35;
    camera.position.set(center.x + distance * (withRoom ? 0.18 : 0.35), center.y + distance * (withRoom ? 0.02 : 0.12), distance);
    sun.target.position.set(toM(design.dimensions.width / 2) + (withRoom ? 1 : 0), 0, toM(-depth / 2));
    sun.position.copy(sun.target.position).add(SUN_OFFSET);
    controls.target.copy(center);
    controls.update();
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
      group.children.forEach((mesh) => { mesh.castShadow = true; });
      scene.add(group);
      renderer.shadowMap.needsUpdate = true;
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = design.dimensions;
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey: `${width}x${height}x${depth}` };
    }
    if (syncBackdrop(design, ui.backdrop)) fitCamera(design, room !== null);
    if (geometryChanged || selection !== rendered.selection) {
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
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop(() => {
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
      resizeObserver.disconnect();
      if (group) disposeWardrobe(group);
      if (room) disposeBackdrop(room);
      scene.environment.dispose();
      highlighter.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
