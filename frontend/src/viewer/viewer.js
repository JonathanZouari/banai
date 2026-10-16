// Interactive Three.js viewer. Renders ONLY from store state: it rebuilds the wardrobe
// whenever the committed design (or door visibility) changes, and never edits state
// except through store.select().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { createDimensions } from './dimensions.js';
import { createHighlighter } from './highlight.js';
import { ghostOf, poseDoor, restOf } from './doorMotion.js';
import { createMaterials } from './materials.js';
import { createMotion, easeInOutCubic, easeOutBack, easeOutCubic } from './motion.js';
import { attachPicking } from './picking.js';
import { toM } from './units.js';

// The page draws the studio backdrop (CSS gradient); the canvas itself is transparent.
const SHADOW_SIZE = 1024;
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: '#1c1f23', transparent: true, opacity: 0.14 });

function createScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#d8d2c6', 1.6));
  const key = new THREE.DirectionalLight('#fff8ef', 2.2);
  key.position.set(-2.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 8;
  key.shadow.blurSamples = 8;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#eef3ff', 0.8);
  fill.position.set(4, 2.5, 4);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.raycast = () => {};
  scene.add(ground);

  const grid = new THREE.GridHelper(12, 24, '#cfcac0', '#dedad2');
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = -0.0005;
  scene.add(grid);
  return { scene, key };
}

// World size (m) covered by one tile of the wood grain texture: across x along.
const GRAIN_TILE = { across: 0.5, along: 2.0 };

/**
 * Re-map box UVs to world space so wood grain keeps a real-world scale on every part
 * (instead of one texture stretched over each face) and runs along the part's length:
 * vertically on sides and doors, left-to-right on shelves, tops and drawer fronts.
 */
function worldScaleUVs(mesh) {
  const { position, normal, uv } = mesh.geometry.attributes;
  const tallFront = mesh.geometry.parameters.height >= mesh.geometry.parameters.width;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) + mesh.position.x;
    const y = position.getY(i) + mesh.position.y;
    const z = position.getZ(i) + mesh.position.z;
    const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
    let across;
    let along;
    if (ny > 0.5) [across, along] = [z, x]; // top/bottom faces: grain runs left-right
    else if (nx > 0.5) [across, along] = [z, y]; // side faces: grain runs vertically
    else if (tallFront) [across, along] = [x, y]; // front/back of doors and sides
    else [across, along] = [y, x]; // front of shelves, drawers, tops: horizontal grain
    uv.setXY(i, across / GRAIN_TILE.across, along / GRAIN_TILE.along);
  }
  uv.needsUpdate = true;
}

/** Shadows plus a faint edge outline, so white panels and door gaps stay readable. */
function dressMeshes(group) {
  group.children.forEach((mesh) => {
    if (mesh.material.map && mesh.geometry.parameters) worldScaleUVs(mesh);
    mesh.castShadow = true; // only the ground receives (VSM self-shadowing would streak panels)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), EDGE_MATERIAL);
    edges.raycast = () => {}; // never pickable: picking reads userData from the mesh
    mesh.add(edges);
  });
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
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D wardrobe view');
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'viewer-labels';
  container.appendChild(labels.domElement);

  const { scene, key } = createScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, minDistance: 0.6, maxDistance: 14, maxPolarAngle: Math.PI / 2 - 0.02 });

  const materials = createMaterials(store.getState().catalog);
  const highlighter = createHighlighter(scene);
  const dimensions = createDimensions(scene);
  const motion = createMotion();
  const ghosts = new THREE.Group();
  ghosts.name = 'door-ghosts';
  scene.add(ghosts);
  let group = null;
  let rendered = { design: null, doorsVisible: null, selection: undefined, dimsKey: null };

  // ---- Camera framing (animated) ----
  const framing = (design) => {
    const { width, height, depth } = design.dimensions;
    const target = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
    const distance = (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.35;
    return { target, position: new THREE.Vector3(target.x + distance * 0.35, target.y + distance * 0.12, distance) };
  };

  /** Fly the camera along an orbit arc (spherical interpolation around the target). */
  const flyTo = ({ position, target }, duration) => {
    motion.cancel('camera');
    const startTarget = controls.target.clone();
    const startOffset = new THREE.Spherical().setFromVector3(camera.position.clone().sub(startTarget));
    const endOffset = new THREE.Spherical().setFromVector3(position.clone().sub(target));
    // Take the short way round.
    const dTheta = Math.atan2(Math.sin(endOffset.theta - startOffset.theta), Math.cos(endOffset.theta - startOffset.theta));
    const spherical = new THREE.Spherical();
    motion.add({
      duration, ease: easeInOutCubic, tag: 'camera',
      update: (t) => {
        controls.target.lerpVectors(startTarget, target, t);
        spherical.set(
          THREE.MathUtils.lerp(startOffset.radius, endOffset.radius, t),
          THREE.MathUtils.lerp(startOffset.phi, endOffset.phi, t),
          startOffset.theta + dTheta * t,
        );
        camera.position.setFromSpherical(spherical).add(controls.target);
        controls.update();
      },
    });
  };

  const fitCamera = (design, { intro = false } = {}) => {
    const goal = framing(design);
    // Keep the shadow light aimed at the wardrobe whatever its size.
    key.target.position.copy(goal.target);
    key.position.set(goal.target.x - 2.5, goal.target.y + 5, goal.target.z + 3.5);
    if (intro) {
      // Start wide and off to the side, then swoop in to the working view.
      const offset = goal.position.clone().sub(goal.target).multiplyScalar(1.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.75);
      offset.y += 1.2;
      controls.target.copy(goal.target);
      camera.position.copy(goal.target).add(offset);
      controls.update();
      flyTo(goal, 1500);
      return;
    }
    flyTo(goal, 800);
  };
  // Any manual orbit/zoom takes over from a running camera flight.
  controls.addEventListener('start', () => motion.cancel('camera'));

  // ---- Wardrobe motion: doors, gliding parts, new parts ----
  const doorMeshes = (target) => (target ? target.children.filter((mesh) => mesh.userData.kind === 'door') : []);
  const centerXOf = (design) => toM(design.dimensions.width / 2);
  const keyOf = (mesh) => `${mesh.userData.componentId}:${mesh.userData.part ?? ''}`;
  const STAGGER = 0.08;
  const staggered = (raw, index) => Math.min(Math.max((raw - index * STAGGER) / (1 - index * STAGGER), 0), 1);

  const swingDoorsAway = (meshes, design) => {
    const centerX = centerXOf(design);
    meshes.forEach((mesh, index) => {
      const ghost = ghostOf(mesh, EDGE_MATERIAL);
      const rest = restOf(ghost.mesh);
      ghosts.add(ghost.mesh);
      motion.add({
        duration: 900, ease: (t) => t, tag: 'ghost',
        update: (_, raw) => {
          const local = staggered(raw, index);
          poseDoor(ghost.mesh, rest, easeInOutCubic(local), centerX);
          ghost.setOpacity(local < 0.55 ? 1 : 1 - (local - 0.55) / 0.45);
        },
        done: () => {
          ghosts.remove(ghost.mesh);
          ghost.dispose();
        },
      });
    });
  };

  const swingDoorsShut = (meshes, design) => {
    const centerX = centerXOf(design);
    meshes.forEach((mesh, index) => {
      const rest = restOf(mesh);
      poseDoor(mesh, rest, 1, centerX);
      motion.add({
        duration: 850, ease: (t) => t, tag: 'wardrobe',
        update: (_, raw) => poseDoor(mesh, rest, 1 - easeOutCubic(staggered(raw, index)), centerX),
      });
    });
  };

  /** Moved parts glide from where they were; brand-new parts pop in. */
  const animateChanges = (previous, next) => {
    next.children.forEach((mesh) => {
      if (mesh.userData.kind === 'door') return;
      const to = mesh.position.clone();
      const before = previous.get(keyOf(mesh));
      if (before) {
        if (before.distanceTo(to) < 0.0005) return;
        mesh.position.copy(before);
        motion.add({ duration: 420, ease: easeInOutCubic, tag: 'wardrobe', update: (t) => mesh.position.lerpVectors(before, to, t) });
        return;
      }
      const from = mesh.userData.kind === 'drawer' ? to.clone().setZ(to.z + 0.35) : to;
      mesh.scale.setScalar(0.001);
      motion.add({
        duration: 520, ease: easeOutBack, tag: 'wardrobe',
        update: (t) => {
          mesh.scale.setScalar(Math.max(t, 0.001));
          mesh.position.lerpVectors(from, to, Math.min(t, 1));
        },
      });
    });
  };

  const sync = (state) => {
    const { design, ui, selection } = state;
    const geometryChanged = design !== rendered.design || ui.doorsVisible !== rendered.doorsVisible;
    const doorsToggled = rendered.doorsVisible !== null && ui.doorsVisible !== rendered.doorsVisible;
    let showDoors = false;
    if (geometryChanged) {
      const previous = new Map();
      if (group) {
        if (doorsToggled && !ui.doorsVisible) swingDoorsAway(doorMeshes(group), rendered.design);
        group.children.forEach((mesh) => previous.set(keyOf(mesh), mesh.position.clone()));
        motion.cancel('wardrobe');
        scene.remove(group);
        disposeWardrobe(group);
      }
      group = buildWardrobe(design, materials, { doorsVisible: ui.doorsVisible });
      dressMeshes(group);
      scene.add(group);
      materials.retainOnly(new Set(group.children.map((mesh) => mesh.material)));
      if (rendered.design && design !== rendered.design) animateChanges(previous, group);
      showDoors = doorsToggled && ui.doorsVisible;
      const { width, height, depth } = design.dimensions;
      const dimsKey = `${width}x${height}x${depth}`;
      if (dimsKey !== rendered.dimsKey) fitCamera(design, { intro: rendered.dimsKey === null });
      rendered = { ...rendered, design, doorsVisible: ui.doorsVisible, dimsKey };
    }
    if (geometryChanged || selection !== rendered.selection) {
      highlighter.update(group, design, selection);
      dimensions.update(group, design, selection);
      rendered = { ...rendered, selection };
    }
    if (showDoors) swingDoorsShut(doorMeshes(group), design);
  };

  // ---- Hover feedback (one raycast per frame at most) ----
  const hoverRay = new THREE.Raycaster();
  let hoverEvent = null;
  const onHoverMove = (event) => {
    hoverEvent = event.buttons === 0 ? event : null;
  };
  const onHoverLeave = () => {
    hoverEvent = null;
    highlighter.hover(group, store.getState().design, null);
    renderer.domElement.style.cursor = '';
  };
  renderer.domElement.addEventListener('pointermove', onHoverMove);
  renderer.domElement.addEventListener('pointerleave', onHoverLeave);
  const updateHover = () => {
    if (!hoverEvent || !group) return;
    const rect = renderer.domElement.getBoundingClientRect();
    hoverRay.setFromCamera(new THREE.Vector2(
      ((hoverEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((hoverEvent.clientY - rect.top) / rect.height) * 2 + 1,
    ), camera);
    hoverEvent = null;
    const [hit] = hoverRay.intersectObjects(group.children, false);
    const { design, selection } = store.getState();
    const id = componentAt(hit, design);
    highlighter.hover(group, design, id && id !== selection?.id ? id : null);
    renderer.domElement.style.cursor = id ? 'pointer' : '';
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

  renderer.setAnimationLoop((time) => {
    motion.tick();
    updateHover();
    highlighter.tick(time);
    dimensions.tick();
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    camera,
    /** Re-frame the camera on the current wardrobe. */
    resetView() {
      fitCamera(store.getState().design);
    },
    /** True while a camera or wardrobe animation is still playing (for tests/tooling). */
    isAnimating: () => motion.isRunning('camera') || motion.isRunning('wardrobe') || motion.isRunning('ghost'),
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
      renderer.domElement.removeEventListener('pointermove', onHoverMove);
      renderer.domElement.removeEventListener('pointerleave', onHoverLeave);
      ghosts.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
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
