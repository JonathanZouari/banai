// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { units } from '../ui/units.js';
import { language } from '../i18n/strings.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

const BACKGROUND = '#eceeec';

function createScene({ grid: withGrid = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.9);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  if (withGrid) {
    const grid = new THREE.GridHelper(12, 24, '#c9ccc8', '#dcdfdb');
    grid.position.y = -0.0005;
    scene.add(grid);
  }
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
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: 14, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog);
  // A soft studio room for mirror reflections only (other materials keep the plain lighting).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture;
  roomEnvironment.dispose?.();
  pmrem.dispose();
  materials.setEnvironment(environment);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  let group = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null };

  const fitCamera = (design) => {
    const { width, height, depth } = design.dimensions;
    const center = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
    const distance = (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.35;
    camera.position.set(center.x + distance * 0.35, center.y + distance * 0.12, distance);
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
      scene.add(group);
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = design.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) fitCamera(design);
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey };
    }
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
  // Dimension labels show the selected unit, so redraw only the labels when it changes.
  const redrawLabels = () => {
    const { design, selection } = store.getState();
    if (group) dimensions.update(group, design, selection);
  };
  const unsubscribeUnits = units.subscribe(redrawLabels);
  const unsubscribeLanguage = language.subscribe(redrawLabels); // the selected-component label is text
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
    /** Back to the default front view of the whole wardrobe. */
    resetView() {
      // Without damping, update() applies and then clears any leftover drag momentum; fitting
      // afterwards makes the view land exactly on the default.
      controls.enableDamping = false;
      controls.update();
      fitCamera(store.getState().design);
      controls.enableDamping = true;
    },
    /**
     * A clean JPEG of the wardrobe (no grid, labels or selection) rendered off-screen, for the PDF export.
     * Never touches the store or the on-screen view. Returns a data URL.
     */
    capture({ doorsVisible = true, width = 1600, height = 1100 } = {}) {
      const { design, catalog } = store.getState();
      const shotRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      shotRenderer.setPixelRatio(1);
      shotRenderer.setSize(width, height, false);
      shotRenderer.outputColorSpace = THREE.SRGBColorSpace;
      const shotScene = createScene({ grid: false });
      const shotMaterials = createMaterials(catalog);
      const shotPmrem = new THREE.PMREMGenerator(shotRenderer);
      const shotRoom = new RoomEnvironment();
      const shotEnvironment = shotPmrem.fromScene(shotRoom, 0.04).texture;
      shotRoom.dispose?.();
      shotMaterials.setEnvironment(shotEnvironment);
      const shotGroup = buildWardrobe(design, shotMaterials, { doorsVisible });
      shotScene.add(shotGroup);
      try {
        const { width: w, height: h, depth: d } = design.dimensions;
        const shotCamera = new THREE.PerspectiveCamera(40, width / height, 0.05, 60);
        const half = Math.tan(THREE.MathUtils.degToRad(shotCamera.fov / 2));
        const distance = Math.max(toM(h) / (2 * half), toM(w) / (2 * half * shotCamera.aspect)) * 1.12 + toM(d) / 2;
        const center = new THREE.Vector3(toM(w / 2), toM(h / 2), toM(-d / 2));
        shotCamera.position.set(center.x + distance * 0.35, center.y + distance * 0.12, center.z + distance);
        shotCamera.lookAt(center);
        shotRenderer.render(shotScene, shotCamera);
        return shotRenderer.domElement.toDataURL('image/jpeg', 0.92);
      } finally {
        disposeWardrobe(shotGroup);
        shotMaterials.dispose();
        shotEnvironment.dispose();
        shotPmrem.dispose();
        shotRenderer.dispose();
        shotRenderer.forceContextLoss();
      }
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
      unsubscribeUnits();
      unsubscribeLanguage();
      detachPicking();
      resizeObserver.disconnect();
      if (group) disposeWardrobe(group);
      highlighter.dispose();
      dimensions.dispose();
      materials.dispose();
      environment.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
