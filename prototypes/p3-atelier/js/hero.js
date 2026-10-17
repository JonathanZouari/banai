// The start-screen hero: a wardrobe that begins as an exploded drawing and assembles itself in a soft
// workshop light, then its overall dimensions draw themselves in pencil. Every part follows a critically
// damped spring (no overshoot), staggered in assembly order. The camera breathes slowly and leans a little
// toward the pointer; touching anything is never blocked. Reduced motion: the finished wardrobe, still.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 2.4;
const H = 2.5;
const D = 0.6;
const T = 0.018;
const PLINTH = 0.08;
const COMP = (W - 2 * T - 2 * T) / 3; // three compartments, two partitions
const EXPLODE_HOLD = 0.7; // s: the exploded drawing is shown before it assembles
const STAGGER = 0.075; // s between parts
const OMEGA = 7.5; // spring stiffness (critically damped: 1 - (1 + wt) e^-wt)

const spring = (t) => (t <= 0 ? 0 : 1 - (1 + OMEGA * t) * Math.exp(-OMEGA * t));

function woodTexture(base, line) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i += 1) {
    const x = rand() * 512;
    g.strokeStyle = `rgba(${line}, ${0.035 + rand() * 0.09})`;
    g.lineWidth = 0.5 + rand() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 12) g.lineTo(x + Math.sin(y * 0.018 + i * 1.7) * (2 + rand() * 3), y);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createHero(canvas, overlay, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const target = new THREE.Vector3(0, 0.5, 0); // below the middle: the wardrobe sits above the cards

  // Light: a warm window from the left, a soft fill, and the room in the reflections.
  const key = new THREE.DirectionalLight(0xffe6cc, 2.4);
  key.position.set(-3.4, 5.2, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3.5, bottom: -1, near: 0.5, far: 14 });
  key.shadow.radius = 14;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xfff6ec, 0xd9cfc4, 0.55));

  // A soft contact shadow under the wardrobe (a cast shadow on an invisible floor reads as a grey slab).
  const contact = document.createElement('canvas');
  contact.width = contact.height = 256;
  const cg = contact.getContext('2d');
  const grad = cg.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(60, 42, 25, 0.55)');
  grad.addColorStop(0.45, 'rgba(60, 42, 25, 0.22)');
  grad.addColorStop(1, 'rgba(60, 42, 25, 0)');
  cg.fillStyle = grad;
  cg.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.45, D * 3.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contact), transparent: true, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0.12, 0.001, 0.1);
  scene.add(floor);

  // Materials: light oak carcass, warm white fronts, bronze handles, linen clothes.
  const oak = woodTexture('#cfaa82', '112, 72, 40');
  const carcass = new THREE.MeshStandardMaterial({ map: oak, roughness: 0.62, metalness: 0 });
  const front = new THREE.MeshStandardMaterial({ color: 0xe7e0d4, roughness: 0.55 }); // warm linen fronts
  const backPanel = new THREE.MeshStandardMaterial({ color: 0xe9dfd2, roughness: 0.8 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6b5644, roughness: 0.32, metalness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.28, metalness: 0.9 });
  const linens = [0xd8cfc2, 0x9fb1bf, 0xc9b39a, 0xe8e2d8, 0x8e9a87, 0xb8a1a0].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  );

  const wardrobe = new THREE.Group();
  scene.add(wardrobe);
  const parts = [];

  const pencil = new THREE.LineBasicMaterial({ color: 0x6f6458, transparent: true, opacity: 0.7, depthWrite: false });

  /**
   * A part: its final pose, and the exploded offset it assembles from. While it travels it is a pencil
   * sketch (graphite edges over a faint body); as it lands, the wood fills in and the lines fade.
   */
  function part(mesh, { at, from = [0, 0, 0], spin = [0, 0, 0], order, sketch = true }) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const skins = [];
    const lines = [];
    mesh.traverse((node) => {
      if (!node.isMesh) return;
      node.material = node.material.clone();
      node.material.transparent = true;
      skins.push(node.material);
      if (sketch) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(node.geometry, 25), pencil.clone());
        node.add(edges);
        lines.push(edges.material);
      }
    });
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.position.set(...at);
    wardrobe.add(holder);
    parts.push({ holder, skins, lines, solid: false, at: new THREE.Vector3(...at), from: new THREE.Vector3(...from),
      spin: new THREE.Euler(...spin), order });
    return holder;
  }
  const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  const comp = (i) => -W / 2 + T + COMP / 2 + i * (COMP + T); // compartment centre x

  let order = 0;
  part(box(W - 2 * T, T, D - 0.002, carcass), { at: [0, PLINTH + T / 2, 0], from: [0, -0.9, 0.25], order: order++ });
  part(box(W - 2 * T, PLINTH, T, carcass), { at: [0, PLINTH / 2, D / 2 - 0.035], from: [0, -0.4, 1.1], order: order++ });
  part(box(T, H, D, carcass), { at: [-W / 2 + T / 2, H / 2, 0], from: [-1.3, 0.15, 0.2], spin: [0, 0, 0.12], order: order++ });
  part(box(T, H, D, carcass), { at: [W / 2 - T / 2, H / 2, 0], from: [1.3, 0.15, 0.2], spin: [0, 0, -0.12], order: order++ });
  part(box(W - 2 * T, T, D - 0.002, carcass), { at: [0, H - T / 2, 0], from: [0, 1.1, 0.2], order: order++ });
  const innerH = H - PLINTH - 2 * T;
  part(box(W - 2 * T, innerH, 0.006, backPanel), { at: [0, PLINTH + T + innerH / 2, -D / 2 + 0.012], from: [0, 0.2, -1.4], order: order++ });
  for (const i of [0, 1]) {
    const x = -W / 2 + T + (i + 1) * COMP + i * T + T / 2;
    part(box(T, innerH, D - 0.03, carcass), { at: [x, PLINTH + T + innerH / 2, -0.012], from: [0, 1.6, 0.4], order: order++ });
  }
  // Interior: shelves, rails, drawers, folded clothes.
  const shelf = (i, y) => part(box(COMP - 0.003, T, D - 0.06, carcass), { at: [comp(i), y, -0.02], from: [0, 0.05, 1.2], order: order++ });
  [1.95].forEach((y) => shelf(0, y));
  [0.98, 1.38, 1.78, 2.18].forEach((y) => shelf(1, y));
  [1.95].forEach((y) => shelf(2, y));
  for (const i of [0, 2]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, COMP - 0.004, 24), steel);
    rail.rotation.z = Math.PI / 2;
    part(rail, { at: [comp(i), 1.84, -0.02], from: [0, 0, 1.0], order: order++ });
  }
  [[0.12, 0.26], [0.42, 0.26], [0.72, 0.22]].forEach(([y0, h]) => {
    const drawer = new THREE.Group();
    const face = box(COMP - 0.008, h - 0.006, T, front);
    face.castShadow = face.receiveShadow = true;
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 16), bronze);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(0, h * 0.18, T / 2 + 0.014);
    drawer.add(face, pull);
    part(drawer, { at: [comp(1), PLINTH + T + y0 + h / 2 - 0.1, D / 2 - T / 2 - 0.004], from: [0, 0, 1.3], order: order++ });
  });
  // Folded stacks on the middle shelves.
  [[1.38, 3], [1.78, 2], [2.18, 3]].forEach(([y, count], row) => {
    for (let k = 0; k < count; k += 1) {
      const fold = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.055, 0.34, 4, 0.02), linens[(row * 2 + k) % linens.length]);
      const x = comp(1) - 0.16 + (k % 2) * 0.33;
      part(fold, { at: [x, y + T / 2 + 0.03 + Math.floor(k / 2) * 0.058, 0.0], from: [0, 0.45, 0.6], spin: [0, 0.3, 0], order: order + row, sketch: false });
    }
  });
  order += 3;

  // Doors: three leaves on hinges. The middle one stays open on the interior.
  const doorH = H - PLINTH - 0.006;
  const doors = [];
  for (let i = 0; i < 3; i += 1) {
    const hingeLeft = i !== 2;
    const width = COMP + T - 0.004 + (i === 1 ? 0 : T / 2);
    const leaf = new THREE.Group();
    const slab = box(width, doorH, T, front);
    slab.position.x = hingeLeft ? width / 2 : -width / 2;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.42, 16), bronze);
    handle.position.set(hingeLeft ? width - 0.05 : -width + 0.05, 0.05, T / 2 + 0.018);
    leaf.add(slab, handle);
    slab.castShadow = slab.receiveShadow = handle.castShadow = true;
    const x = hingeLeft ? comp(i) - COMP / 2 - T / 2 + 0.002 : comp(i) + COMP / 2 + T / 2 - 0.002;
    const from = [[-1.55, 0.1, 0.5], [0, 2.4, 0.4], [1.15, 0.15, 0.8]][i]; // the right one stays clear of the heading
    const holder = part(leaf, { at: [x, PLINTH + doorH / 2 + 0.003, D / 2 + T / 2 + 0.002], from, spin: [0, hingeLeft ? -0.35 : 0.35, 0], order: order++ });
    doors.push({ leaf, holder, open: i === 1 ? -1.2 : 0 }); // ajar: an invitation, not a slab
  }

  // Pencil dimensions: width along the floor in front, height on the left side.
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };
  function dimension(label) {
    const group = make('g', { class: 'dim' });
    const line = make('line', { class: 'dim__line', pathLength: '1' });
    const tickA = make('line', { class: 'dim__tick' });
    const tickB = make('line', { class: 'dim__tick' });
    const text = make('text', { class: 'dim__label', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    const pill = make('rect', { class: 'dim__pill', rx: '11', ry: '11', height: '22' });
    group.append(line, tickA, tickB, pill, text);
    overlay.append(group);
    return { group, line, tickA, tickB, text, pill, label };
  }
  const widthDim = dimension(240);
  const heightDim = dimension(250);
  const v = new THREE.Vector3();
  const toScreen = (x, y, z) => {
    v.set(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width, (-v.y * 0.5 + 0.5) * r.height];
  };
  function placeDimension(dim, a, b, progress) {
    const [x1, y1] = toScreen(...a);
    const [x2, y2] = toScreen(...b);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [nx, ny] = [-(y2 - y1) / len * 7, (x2 - x1) / len * 7]; // tick half-length, perpendicular
    dim.line.setAttribute('x1', x1); dim.line.setAttribute('y1', y1);
    dim.line.setAttribute('x2', x2); dim.line.setAttribute('y2', y2);
    dim.line.style.strokeDashoffset = String(1 - progress);
    for (const [tick, x, y, at] of [[dim.tickA, x1, y1, 0], [dim.tickB, x2, y2, 1]]) {
      tick.setAttribute('x1', x - nx); tick.setAttribute('y1', y - ny);
      tick.setAttribute('x2', x + nx); tick.setAttribute('y2', y + ny);
      tick.style.opacity = progress >= at ? '1' : '0';
    }
    const shown = Math.round(dim.label * Math.min(1, progress * 1.15));
    dim.text.textContent = `${shown} ס״מ`;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    dim.text.setAttribute('x', mx); dim.text.setAttribute('y', my);
    const w = 70;
    dim.pill.setAttribute('x', mx - w / 2); dim.pill.setAttribute('y', my - 11); dim.pill.setAttribute('width', w);
    const label = Math.max(0, Math.min(1, (progress - 0.25) / 0.4));
    dim.text.style.opacity = dim.pill.style.opacity = String(label);
  }

  // Timeline.
  const lastOrder = Math.max(...parts.map((p) => p.order));
  const assembled = EXPLODE_HOLD + lastOrder * STAGGER + 0.9;
  const doorsOpen = assembled + 0.15;
  const dimsStart = assembled + 0.45;
  let start = performance.now();
  let pointer = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  let width = 0;
  let height = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width === width && r.height === height) return;
    width = r.width;
    height = r.height;
    renderer.setSize(width, height, false);
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    camera.aspect = width / height;
    // On a wide screen the text sits on the right (RTL), so the wardrobe moves left of centre.
    if (width / height > 1.15) camera.setViewOffset(width, height, width * 0.17, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    resize();
    const t = reducedMotion ? 99 : (now - start) / 1000;
    for (const p of parts) {
      const s = spring(t - EXPLODE_HOLD - p.order * STAGGER);
      p.holder.position.copy(p.at).addScaledVector(p.from, 1 - s);
      p.holder.rotation.set(p.spin.x * (1 - s), p.spin.y * (1 - s), p.spin.z * (1 - s));
      // Sketch to wood: the body fills in during the last part of the travel, then the pencil fades.
      const fill = Math.min(1, Math.max(0, (s - 0.55) / 0.4));
      if (!p.solid) {
        p.skins.forEach((m) => { m.opacity = 0.08 + 0.92 * fill; });
        p.lines.forEach((m) => { m.opacity = 0.75 * (1 - fill) + 0.0; });
        if (fill >= 1) {
          p.skins.forEach((m) => { m.transparent = false; m.opacity = 1; m.needsUpdate = true; });
          p.solid = true;
        }
      } else if (fill < 1) { // replayed
        p.skins.forEach((m) => { m.transparent = true; m.needsUpdate = true; });
        p.solid = false;
      }
    }
    for (const door of doors) {
      const s = spring((t - doorsOpen) * 0.75);
      door.leaf.rotation.y = door.open * s;
    }
    // The camera: a slow breath around the front, a small lean toward the pointer, a dolly-in on assembly.
    const breath = reducedMotion ? 0 : Math.sin(t * 0.16) * 0.07;
    lean.x += (pointer.x - lean.x) * 0.04;
    lean.y += (pointer.y - lean.y) * 0.04;
    const dolly = 1 - 0.12 * spring(t - EXPLODE_HOLD * 0.5);
    const angle = 0.42 + breath + lean.x * 0.08;
    const portrait = Math.max(1, 1.2 / camera.aspect); // a narrow window: step back until the width fits
    const distance = 12.6 * dolly * portrait;
    camera.position.set(Math.sin(angle) * distance, 1.45 + lean.y * 0.25, Math.cos(angle) * distance);
    camera.lookAt(target);
    renderer.render(scene, camera);
    const d = Math.max(0, Math.min(1, (t - dimsStart) / 1.1));
    const ease = 1 - (1 - d) ** 3;
    placeDimension(widthDim, [-W / 2, 0.005, D / 2 + 0.32], [W / 2, 0.005, D / 2 + 0.32], ease);
    placeDimension(heightDim, [-W / 2 - 0.26, 0, D / 2], [-W / 2 - 0.26, H, D / 2], Math.max(0, Math.min(1, ease * 1.1 - 0.1)));
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (event) => {
    pointer = { x: (event.clientX / window.innerWidth) * 2 - 1, y: (event.clientY / window.innerHeight) * 2 - 1 };
  }, { passive: true });
  let raf = requestAnimationFrame(frame);

  return {
    replay() {
      start = performance.now();
    },
    get assembledAt() {
      return assembled;
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
