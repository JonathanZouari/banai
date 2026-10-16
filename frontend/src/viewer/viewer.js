// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design, a pending proposal or door visibility changes, and
// never edits state except through store.select(). While an AI proposal is pending it
// renders the proposal's preview design, styled by proposalPreview.js; the committed
// design itself is untouched until the proposal is applied.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createDoorMotion } from './doorMotion.js';
import { createHighlighter } from './highlight.js';
import { createMaterials } from './materials.js';
import { createProposalPreview } from './proposalPreview.js';
import { createRoom } from './room.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';


function createScene() {
  const scene = new THREE.Scene();
  // Transparent background: the stage's CSS gradient shows through the canvas.
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.9);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  return scene;
}

/** Map a raycast hit to a selectable component id (the back panel selects its compartment). */
function componentAt(hit, design) {
  if (!hit) return null;
  const { componentId, part } = hit.object.userData;
  if (hit.object.userData.preview === 'removed') return null;
  if (part !== 'back') return componentId;
  const frame = frameOf(design);
  const xMm = hit.point.x * 1000;
  const index = frame.ranges.findIndex(([x0, x1]) => xMm >= x0 && xMm <= x1);
  return index >= 0 ? design.compartments[index].id : componentId;
}

export function createViewer(container, store) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
  const preview = createProposalPreview(scene);
  const room = createRoom(scene); // decorative empty room (not part of the design)
  // Mirror doors reflect the real room: a cube camera captures it whenever the design or
  // the room style changes (not every frame), with the doors hidden so they do not
  // reflect themselves. The capture uses the wall colour as the backdrop.
  const reflection = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCamera = new THREE.CubeCamera(0.05, 40, reflection);
  materials.setEnvMap(reflection.texture);
  let reflectionDirty = true;
  const updateReflection = () => {
    reflectionDirty = false;
    if (!group || !group.children.some((mesh) => mesh.material.userData?.mirror)) return;
    const doors = group.children.filter((mesh) => mesh.userData.kind === 'door');
    doors.forEach((mesh) => { mesh.visible = false; });
    const { width, height } = shownDesign.dimensions;
    cubeCamera.position.set(toM(width / 2), toM(Math.min(height, 2400) / 2), 1.6);
    const background = scene.background;
    scene.background = new THREE.Color(store.getState().ui.room.wall);
    cubeCamera.update(renderer, scene);
    scene.background = background;
    doors.forEach((mesh) => { mesh.visible = true; });
  };
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const doorMotion = createDoorMotion(reducedMotion ? { durationMs: 0 } : {});
  const clock = new THREE.Clock();
  let group = null;
  let shownDesign = null;
  let rendered = { design: null, proposal: undefined, doorsVisible: null, selection: undefined, dims: undefined, dimsKey: null };

  const fitCamera = (design) => {
    const { width, height, depth } = design.dimensions;
    // Aim slightly below the middle and leave margin, so the floating toolbar (top) and
    // structure strip (bottom) never cover the wardrobe.
    const center = new THREE.Vector3(toM(width / 2), toM(height * 0.44), toM(-depth / 2));
    const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const hTan = vTan * Math.max(camera.aspect, 0.1); // narrow (mobile) views are limited by width
    const distance = Math.max(toM(height) / (2 * vTan), toM(width) / (2 * hTan)) * 1.6;
    camera.position.set(center.x + distance * 0.35, center.y + distance * 0.12, distance);
    controls.target.copy(center);
    controls.update();
  };

  const sync = (state) => {
    const { design, ui, selection } = state;
    // A stale proposal is no longer previewed: the view falls back to the committed design.
    const proposal = state.proposal && !state.proposal.stale ? state.proposal : null;
    const geometryChanged = design !== rendered.design || proposal !== rendered.proposal || ui.doorsVisible !== rendered.doorsVisible;
    if (geometryChanged) {
      if (group) {
        scene.remove(group);
        disposeWardrobe(group);
      }
      shownDesign = proposal ? proposal.previewDesign : design;
      const options = { doorsVisible: ui.doorsVisible };
      group = buildWardrobe(shownDesign, materials, options);
      scene.add(group);
      preview.decorate(group, proposal, design, materials, options);
      doorMotion.attach(group); // keep open doors open across rebuilds
      reflectionDirty = true;
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      const { width, height, depth } = shownDesign.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) {
        room.update(shownDesign.dimensions);
        fitCamera(shownDesign);
      }
      rendered = { ...rendered, design, proposal, doorsVisible: ui.doorsVisible, dimsKey };
    }
    if (ui.room !== rendered.room) {
      room.setStyle(ui.room);
      reflectionDirty = true;
      rendered = { ...rendered, room: ui.room };
    }
    if (geometryChanged || selection !== rendered.selection || ui.dimensions !== rendered.dims) {
      highlighter.update(group, shownDesign, selection);
      dimensions.update(group, shownDesign, selection, { visible: ui.dimensions });
      rendered = { ...rendered, selection, dims: ui.dimensions };
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
    onHover: (hit) => { renderer.domElement.style.cursor = hit?.object.userData.componentId ? 'pointer' : ''; },
    onPick: (hit) => {
      const id = componentAt(hit, store.getState().design);
      // Clicking a door also opens or closes it (visual only, never a design edit).
      if (hit?.object.userData.kind === 'door') doorMotion.toggle(id);
      store.select(id);
    },
  });
  const unsubscribe = store.subscribe(sync);
  sync(store.getState());

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta() * 1000, 100); // ms; clamped after a hidden tab
    if (reflectionDirty) updateReflection();
    if (doorMotion.tick(dt, group)) {
      const { selection } = store.getState();
      if (selection?.kind === 'door') {
        highlighter.update(group, shownDesign, selection);
        dimensions.update(group, shownDesign, selection, { visible: store.getState().ui.dimensions });
      }
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    controls,
    canvas: renderer.domElement,
    /** Visual door state (tests and tooling). */
    isDoorOpen: (id) => doorMotion.isOpen(id),
    /** Show or hide the decorative room (e.g. for a clean-background capture in Phase 8). */
    setRoomVisible: (visible) => room.setVisible(visible),
    /** Re-frame the camera on the wardrobe (toolbar "Reset view"). */
    resetView: () => fitCamera(shownDesign ?? store.getState().design),
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
      preview.dispose();
      room.dispose();
      reflection.dispose();
      dimensions.dispose();
      materials.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
