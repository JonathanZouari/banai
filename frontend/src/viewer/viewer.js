// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design changes, animates the doors open or closed when door
// visibility changes, and never edits state except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { poseDoors } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

const BACKGROUND = '#eceeec';
// ASSUMPTION: visual-only studio setup, tuned by eye.
// The key light comes from the upper left, so the floor shadow falls to the right, toward
// the default camera, and the side panels read darker than the fronts.
const KEY_DIRECTION = new THREE.Vector3(-2.2, 4, 3).normalize();
const DOOR_ANIMATION_MS = 450;
// Strong ease-in-out (doors move on screen): approximates cubic-bezier(0.77, 0, 0.175, 1).
const easeInOut = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - ((-2 * t + 2) ** 4) / 2);
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function createScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  // The grid fades into the background with distance; wardrobe materials opt out of fog.
  scene.fog = new THREE.Fog(BACKGROUND, 6, 16);

  // Soft studio reflections, generated in code (no HDR download).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.45;
  room.traverse((object) => object.geometry?.dispose());
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#ffffff', '#cfc8bb', 0.7));
  const key = new THREE.DirectionalLight('#fff8f0', 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#eef2ff', 0.45);
  fill.position.set(4, 1.5, 5);
  scene.add(fill);

  // A floor that only shows the wardrobe's shadow, over a faint grid for scale.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(24, 48, '#d6d9d5', '#e1e3e0');
  grid.position.y = -0.0005;
  scene.add(grid);
  return { scene, key };
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
  // Neutral tone mapping keeps the catalog colours close to their swatches.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // honours shadow.radius (soft edges); PCFSoft ignores it
  // Shadows only change with the scene, not the camera: redraw the shadow map on demand.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view. Every part is also listed under All parts in the Properties panel.');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const { scene, key } = createScene(renderer);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: 14, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  let group = null;
  let rendered = { design: null, selection: undefined, dimsKey: null };
  // Door animation: progress runs linearly 0..1 toward the target; the pose uses the eased value.
  const doors = { progress: store.getState().ui.doorsVisible ? 0 : 1, target: 0, last: 0 };
  doors.target = doors.progress;
  const doorsAmount = () => easeInOut(doors.progress);
  // Frames are drawn only when something changed (state, size, camera, doors): an idle
  // viewer costs nothing, which matters with shadows on laptops and software renderers.
  let dirty = true;
  const invalidate = ({ shadows = false } = {}) => {
    dirty = true;
    if (shadows) renderer.shadowMap.needsUpdate = true;
  };

  const fitCamera = (design) => {
    const { width, height, depth } = design.dimensions;
    const center = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
    const distance = (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.35;
    camera.position.set(center.x + distance * 0.35, center.y + distance * 0.12, distance);
    controls.target.copy(center);
    controls.update();
    // The shadow camera tightly covers the wardrobe (plus open doors), keeping the shadow crisp.
    const reach = toM(Math.max(width, height, depth)) * 1.1;
    key.target.position.copy(center);
    key.position.copy(center).addScaledVector(KEY_DIRECTION, reach * 3);
    Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: reach * 6 });
    key.shadow.camera.updateProjectionMatrix();
  };

  const sync = (state) => {
    const { design, ui, selection } = state;
    doors.target = ui.doorsVisible ? 0 : 1;
    if (prefersReducedMotion()) doors.progress = doors.target;
    const geometryChanged = design !== rendered.design;
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsOpen: doorsAmount() });
      scene.add(group);
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = design.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) fitCamera(design);
      rendered = { ...rendered, design, dimsKey };
    } else if (group) {
      poseDoors(group, doorsAmount());
    }
    if (geometryChanged || selection !== rendered.selection) {
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
    }
    invalidate({ shadows: true });
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    labels.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
    invalidate();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const detachPicking = attachPicking({
    dom: renderer.domElement,
    camera,
    // While the doors are open or moving, clicks go into the cabinet: doors are not pickable.
    getTargets: () => {
      if (!group) return [];
      const doorsMoving = doors.target === 1 || doors.progress > 0;
      return doorsMoving ? group.children.filter((mesh) => mesh.userData.kind !== 'door') : group.children;
    },
    onPick: (hit) => store.select(componentAt(hit, store.getState().design)),
    onHover: (hit) => { renderer.domElement.style.cursor = hit?.object.userData.componentId ? 'pointer' : ''; },
  });
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop((time) => {
    const elapsed = Math.min(time - doors.last, 100); // a background tab must not jump the animation
    doors.last = time;
    if (doors.progress !== doors.target && group) {
      const step = elapsed / DOOR_ANIMATION_MS;
      doors.progress = doors.target > doors.progress
        ? Math.min(doors.target, doors.progress + step)
        : Math.max(doors.target, doors.progress - step);
      poseDoors(group, doorsAmount());
      highlighter.follow();
      dimensions.follow();
      invalidate({ shadows: true });
    }
    if (controls.update()) invalidate(); // true while the camera moves, including damping
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
    /** How far the doors are open, 0..1 (eased), for tests and tooling. */
    doorsOpenAmount: doorsAmount,
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
      highlighter.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
