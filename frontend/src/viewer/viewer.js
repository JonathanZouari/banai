// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { ease, frameView } from './camera.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

const BACKGROUND = '#eceeec';

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
  const grid = new THREE.GridHelper(12, 48, '#d6d8d4', '#e2e4e0');
  grid.position.y = -0.001;
  scene.add(grid);
  return scene;
}

/** A soft radial "contact shadow" under the wardrobe (a textured plane, no shadow maps). */
function createFloorShadow() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(40, 36, 30, 0.32)');
  gradient.addColorStop(0.55, 'rgba(40, 36, 30, 0.12)');
  gradient.addColorStop(1, 'rgba(40, 36, 30, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0005;
  mesh.renderOrder = -1;
  mesh.raycast = () => {}; // never pickable
  return mesh;
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
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  const floorShadow = createFloorShadow();
  scene.add(floorShadow);
  let group = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null };
  let view = 'angle';
  let tween = null;

  /** Frame the wardrobe from a preset; animated unless `instant`. */
  const fitCamera = (design, { instant = false } = {}) => {
    const { target, position } = frameView(design.dimensions, { fovDeg: camera.fov, aspect: camera.aspect, view });
    const to = { position: new THREE.Vector3(...position), target: new THREE.Vector3(...target) };
    if (instant) {
      tween = null;
      camera.position.copy(to.position);
      controls.target.copy(to.target);
      controls.update();
      return;
    }
    tween = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, start: performance.now(), duration: 450 };
  };

  const stepTween = (now) => {
    if (!tween) return;
    const t = Math.min((now - tween.start) / tween.duration, 1);
    const k = ease(t);
    camera.position.lerpVectors(tween.from.position, tween.to.position, k);
    controls.target.lerpVectors(tween.from.target, tween.to.target, k);
    if (t === 1) tween = null;
  };

  const placeFloorShadow = (design) => {
    const { width, depth } = design.dimensions;
    floorShadow.scale.set(toM(width) * 1.5 + 0.4, toM(depth) * 2.2 + 0.4, 1);
    floorShadow.position.set(toM(width / 2), 0.0005, toM(-depth / 2));
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
      if (dimsKey !== rendered.dimsKey) {
        fitCamera(design, { instant: rendered.dimsKey === null });
        placeFloorShadow(design);
      }
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
  });
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  // Any manual orbit or zoom cancels a running camera transition.
  controls.addEventListener('start', () => { tween = null; });

  renderer.setAnimationLoop((now) => {
    stepTween(now);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
    /** Move to a view preset ('front' | 'angle' | 'side' | 'top'); re-frames the wardrobe. */
    setView(name) {
      view = name;
      fitCamera(store.getState().design);
    },
    /** Re-frame the wardrobe from the current preset. */
    fit() {
      fitCamera(store.getState().design);
    },
    get view() {
      return view;
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
      resizeObserver.disconnect();
      if (group) disposeWardrobe(group);
      highlighter.dispose();
      floorShadow.geometry.dispose();
      floorShadow.material.map.dispose();
      floorShadow.material.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
