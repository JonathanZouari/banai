// 3D viewer for the P1 prototype: live PBR view + on-demand path-traced render.
// Renders from the layout only; it never owns design data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init(); // the raster fallback frame may include the area light
import { decorById, ROOM_TEXTURES, PANEL, PLINTH, DOOR_GAP, SLIDE_OVERLAP, cm } from './model.js';

const MM = 0.001;
const ACCENT = '#0071e3';
const DOOR_OPEN = THREE.MathUtils.degToRad(96);
const RENDER_SAMPLES = 400;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Critically damped spring (damping ratio 1), implicit integration: stable at any dt.
// `response` is Apple's "response" parameter, in seconds.
function spring(s, target, dt, response) {
  if (reduceMotion) { s.x = target; s.v = 0; return; }
  const w = (2 * Math.PI) / response;
  const f = 1 + 2 * dt * w;
  const oo = w * w;
  const inv = 1 / (f + dt * dt * oo);
  const x = (f * s.x + dt * s.v + dt * dt * oo * target) * inv;
  s.v = (s.v + dt * oo * (target - s.x)) * inv;
  s.x = x;
}
const settled = (s, t) => Math.abs(s.x - t) < 1e-4 && Math.abs(s.v) < 1e-3;

// World-scale UVs: grain runs along `grain` ('x' | 'y'), one texture tile = `tile` mm.
// A per-part offset keeps neighbouring panels from showing the same figure.
function worldUV(geo, grain, tile, seed) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const s = 1 / (tile * MM);
  const ou = ((seed * 0.6180339) % 1) * 0.9;
  const ov = ((seed * 0.4142135) % 1) * 0.9;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const axis = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    const inPlane = [0, 1, 2].filter((a) => a !== axis);
    const g = grain === 'x' ? 0 : 1;
    let u;
    let v;
    if (inPlane.includes(g)) {
      v = p[g];
      u = p[inPlane.find((a) => a !== g)];
    } else {
      [u, v] = [p[inPlane[0]], p[inPlane[1]]];
    }
    uv.setXY(i, u * s + ou, v * s + ov);
  }
  uv.needsUpdate = true;
}

export class Viewer {
  constructor(container, { onSelect, onHover } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.texLoader = new THREE.TextureLoader();
    this.texCache = new Map();
    this.matCache = new Map();
    this.pending = new Set();
    this.doorSprings = new Map();
    this.flashes = [];
    this.view = { doorsOpen: false, dims: true };
    this.rendering = false;
    this.renderDone = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9e8e4');
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.085, minDistance: 1.4, maxDistance: 11, maxPolarAngle: Math.PI * 0.49, screenSpacePanning: true });
    this.controls.addEventListener('start', () => { this.camAnim = null; });
    this.controls.addEventListener('change', () => {
      if (this.rendering && this.pt) { this.pt.updateCamera(); this.renderDone = false; }
    });

    this.#setupLights();
    this.#setupRoom();
    this.wardrobe = new THREE.Group();
    this.helpers = new THREE.Group();
    this.scene.add(this.wardrobe, this.helpers);

    this.#setupPicking();
    new ResizeObserver(() => this.#resize()).observe(container);
    this.#resize();
    r.setAnimationLoop(() => this.#tick());
  }

  // ---------- setup ----------
  #setupLights() {
    const env = new HDRLoader().loadAsync('./env/small_empty_room_3_1k.hdr').then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = tex;
      this.scene.environmentIntensity = 0.95;
      this.scene.environmentRotation.y = Math.PI * 0.5;
    });
    this.#track(env);
    const key = (this.keyLight = new THREE.DirectionalLight('#fff6ea', 1.25));
    key.position.set(2.6, 4.2, 4.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.4, bottom: -0.6, near: 0.5, far: 14 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);

    // A soft "window" for the path tracer only: an area light is sampled directly, so it
    // gives soft directional shadows and converges far faster than environment light alone.
    const win = (this.windowLight = new THREE.RectAreaLight('#fff4e6', 7, 1.6, 2.1));
    win.position.set(-2.4, 2.1, 2.8);
    win.lookAt(0, 1.1, 0.3);
    win.visible = false;
    this.scene.add(win);
  }

  #setupRoom() {
    const floorMat = this.#roomMaterial(ROOM_TEXTURES.floor, '#ffffff', 0.85);
    const floorGeo = new THREE.PlaneGeometry(14, 14);
    const fuv = floorGeo.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fuv.getX(i) * 14) / 1.7, (fuv.getY(i) * 14) / 1.7);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 5;
    floor.receiveShadow = true;

    // Plaster relief from the scan's normal map only; the colour is a clean warm white.
    this.wallMat = new THREE.MeshPhysicalMaterial({
      color: '#eeebe5', roughness: 0.95,
      normalMap: this.#tex(ROOM_TEXTURES.wall.normalMap), normalScale: new THREE.Vector2(0.35, 0.35),
    });
    const wallGeo = new THREE.PlaneGeometry(14, 4.2);
    const wuv = wallGeo.attributes.uv;
    for (let i = 0; i < wuv.count; i++) wuv.setXY(i, (wuv.getX(i) * 14) / 2, (wuv.getY(i) * 4.2) / 2);
    const wall = new THREE.Mesh(wallGeo, this.wallMat);
    wall.position.set(0, 2.1, -0.002);
    wall.receiveShadow = true;
    this.room = new THREE.Group();
    this.room.add(floor, wall);
    this.nicheWalls = new THREE.Group();
    this.scene.add(this.room, this.nicheWalls);
  }

  #roomMaterial(t, color, roughness) {
    const map = this.#tex(t.map, true);
    return new THREE.MeshPhysicalMaterial({
      color, roughness, map,
      normalMap: this.#tex(t.normalMap), roughnessMap: this.#tex(t.roughnessMap),
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
  }

  #tex(url, srgb = false) {
    if (this.texCache.has(url)) return this.texCache.get(url);
    let resolve;
    const p = new Promise((res) => { resolve = res; });
    const t = this.texLoader.load(url, () => resolve(), undefined, () => resolve());
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(url, t);
    this.#track(p);
    return t;
  }

  #track(p) {
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
  }

  async ready() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  #decorMaterial(id) {
    const key = `decor:${id}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const d = decorById(id);
    const m = d.map
      ? new THREE.MeshPhysicalMaterial({
        color: '#ffffff', roughness: 1, map: this.#tex(d.map, true),
        normalMap: this.#tex(d.normalMap), roughnessMap: this.#tex(d.roughnessMap),
        normalScale: new THREE.Vector2(0.45, 0.45), specularIntensity: 0.6,
      })
      : new THREE.MeshPhysicalMaterial({ color: d.color, roughness: d.roughness, specularIntensity: 0.55 });
    m.userData.tile = d.size ?? 1000;
    this.matCache.set(key, m);
    return m;
  }

  #material(kind) {
    if (this.matCache.has(kind)) return this.matCache.get(kind);
    const m = {
      metal: () => new THREE.MeshPhysicalMaterial({ color: '#c9cbce', metalness: 1, roughness: 0.3 }),
      chrome: () => new THREE.MeshPhysicalMaterial({ color: '#e6e8ea', metalness: 1, roughness: 0.12 }),
      mirror: () => new THREE.MeshPhysicalMaterial({ color: '#f4f6f6', metalness: 1, roughness: 0.015 }),
      track: () => new THREE.MeshPhysicalMaterial({ color: '#b9bcc0', metalness: 1, roughness: 0.38 }),
    }[kind]();
    this.matCache.set(kind, m);
    return m;
  }

  // ---------- build ----------
  build(state, L) {
    this.state = state;
    this.L = L;
    this.#clear(this.wardrobe);
    this.pickables = [];
    this.ledLights = [];
    const { W, H, D } = L;
    const P = PANEL;
    const Hi = L.interiorH;
    const y0 = PLINTH + P;
    const body = state.decor.body;
    const front = state.decor.front;
    const openWardrobe = state.doors.type === 'none';
    let seed = 1;

    const part = (o) => {
      const { w, h, d, x, y, z, decor, mat, grain = 'y', rounded = false, tag = {}, parent = this.wardrobe } = o;
      const geo = rounded
        ? new RoundedBoxGeometry(w * MM, h * MM, d * MM, 2, Math.min(1.6, d / 3) * MM)
        : new THREE.BoxGeometry(w * MM, h * MM, d * MM);
      const material = mat ?? this.#decorMaterial(decor);
      if (decor) worldUV(geo, grain, material.userData.tile, seed++);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set((x - (parent === this.wardrobe ? W / 2 : 0)) * MM, y * MM, z * MM);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = tag;
      parent.add(mesh);
      this.pickables.push(mesh);
      return mesh;
    };

    // Carcass: full-height sides, top and bottom between them, plinth set back.
    part({ w: P, h: H, d: D, x: P / 2, y: H / 2, z: D / 2, decor: body, rounded: true, tag: { kind: 'carcass' } });
    part({ w: P, h: H, d: D, x: W - P / 2, y: H / 2, z: D / 2, decor: body, rounded: true, tag: { kind: 'carcass' } });
    part({ w: W - 2 * P, h: P, d: D, x: W / 2, y: H - P / 2, z: D / 2, decor: body, grain: 'x', tag: { kind: 'carcass' } });
    part({ w: W - 2 * P, h: P, d: D, x: W / 2, y: PLINTH + P / 2, z: D / 2, decor: body, grain: 'x', tag: { kind: 'carcass' } });
    part({ w: W - 2 * P, h: PLINTH - 4, d: P, x: W / 2, y: (PLINTH - 4) / 2, z: D - 30 - P / 2, decor: body, grain: 'x', tag: { kind: 'carcass' } });
    part({ w: W - 2 * P, h: Hi, d: 5, x: W / 2, y: y0 + Hi / 2, z: 10.5, decor: body, tag: { kind: 'carcass' } });

    const innerDepth = L.shelfDepth - 13;
    const innerZ = 13 + innerDepth / 2;
    L.comps.forEach((c, i) => {
      if (i < L.n - 1) {
        part({ w: P, h: Hi, d: innerDepth + 8, x: c.x0 + c.w + P / 2, y: y0 + Hi / 2, z: 13 + (innerDepth + 8) / 2, decor: body, tag: { kind: 'carcass', comp: i } });
      }
      const cx = c.x0 + c.w / 2;
      for (const s of c.shelves) {
        part({ w: c.w - 2, h: P, d: innerDepth, x: cx, y: y0 + s + P / 2, z: innerZ, decor: body, grain: 'x', rounded: true, tag: { kind: 'shelf', comp: i } });
      }
      for (const ry of c.rails) this.#rail(c, y0 + ry, innerZ, W);
      for (const dr of c.drawers) this.#drawer(c, dr, y0, innerDepth, openWardrobe ? front : body, openWardrobe, W, part);
      if (c.pulldown) this.#pulldown(c, y0 + c.pulldown.y, innerDepth, W);
      if (c.shoes) this.#shoes(c, y0, innerDepth, W, body, part);
      if (c.trousers) this.#trousers(c, y0, innerDepth, W);
      if (c.led) this.#led(c, L, innerDepth, W);
    });

    if (state.doors.type === 'hinged') this.#hingedDoors(state, L, part);
    else if (L.sliding) this.#slidingDoors(state, L, part);

    this.#niche(state, L);
    this.#helpers(state, L);
    this.#syncDoors(true);
    if (this.rendering) this.stopRender();
  }

  #rail(c, y, z, W) {
    const chrome = this.#material('chrome');
    const len = (c.w - 4) * MM;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, len, 32), chrome);
    tube.rotation.z = Math.PI / 2;
    tube.position.set((c.x0 + c.w / 2 - W / 2) * MM, y * MM, z * MM);
    tube.castShadow = true;
    tube.userData = { kind: 'rail', comp: c.index };
    this.wardrobe.add(tube);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 32), this.#material('metal'));
      cup.rotation.z = Math.PI / 2;
      cup.position.set((c.x0 + c.w / 2 - W / 2) * MM + side * (len / 2), y * MM, z * MM);
      this.wardrobe.add(cup);
    }
    this.pickables.push(tube);
  }

  #drawer(c, dr, y0, innerDepth, decor, flush, W, part) {
    const frontZ = flush ? this.L.D - PANEL / 2 - 2 : 13 + innerDepth - PANEL / 2 - 6;
    const cx = c.x0 + c.w / 2;
    const yc = y0 + dr.y + dr.h / 2 + 3;
    const tag = { kind: 'drawer', comp: c.index };
    part({ w: c.w - 6, h: dr.h, d: PANEL, x: cx, y: yc, z: frontZ, decor, grain: 'x', rounded: true, tag });
    const boxD = innerDepth - 60;
    const boxH = dr.h - 60;
    const backZ = frontZ - PANEL / 2 - boxD;
    for (const sx of [c.x0 + 26 + 6, c.x0 + c.w - 26 - 6]) {
      part({ w: 12, h: boxH, d: boxD, x: sx, y: yc - 20, z: frontZ - PANEL / 2 - boxD / 2, decor: 'snow', grain: 'x', tag });
    }
    part({ w: c.w - 64, h: boxH, d: 12, x: cx, y: yc - 20, z: backZ + 6, decor: 'snow', grain: 'x', tag });
    part({ w: c.w - 64, h: 8, d: boxD, x: cx, y: yc - 20 - boxH / 2 + 4, z: frontZ - PANEL / 2 - boxD / 2, decor: 'snow', grain: 'x', tag });
    if (this.state.doors.handle !== 'none') {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 20), this.#material('metal'));
      bar.rotation.z = Math.PI / 2;
      bar.position.set((cx - W / 2) * MM, (yc + dr.h * 0.22) * MM, (frontZ + PANEL / 2 + 22) * MM);
      bar.castShadow = true;
      this.wardrobe.add(bar);
    }
  }

  // ---------- interior inserts ----------
  #mesh(geo, mat, x, y, z, tag, W) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x - W / 2) * MM, y * MM, z * MM);
    m.castShadow = m.receiveShadow = true;
    m.userData = tag;
    this.wardrobe.add(m);
    this.pickables.push(m);
    return m;
  }

  // Pull-down rail (pantograph), shown stowed: rail, two side arms and a pull rod.
  #pulldown(c, y, innerDepth, W) {
    const tag = { kind: 'insert', comp: c.index };
    const z = 13 + innerDepth * 0.5;
    const tube = this.#mesh(new THREE.CylinderGeometry(0.0125, 0.0125, (c.w - 60) * MM, 32), this.#material('chrome'), c.x0 + c.w / 2, y, z, tag, W);
    tube.rotation.z = Math.PI / 2;
    for (const sx of [c.x0 + 14, c.x0 + c.w - 14]) {
      const arm = this.#mesh(new RoundedBoxGeometry(0.008, 0.34, 0.04, 2, 0.003), this.#material('track'), sx, y + 150, z - 60, tag, W);
      arm.rotation.x = -0.45;
    }
    const rod = this.#mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.42, 16), this.#material('metal'), c.x0 + c.w / 2, y - 220, z + 40, tag, W);
    rod.rotation.x = 0.12;
    this.#mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 24, Math.PI), this.#material('metal'), c.x0 + c.w / 2, y - 435, z + 66, tag, W).rotation.z = Math.PI;
  }

  // Sloped shoe shelves with a front fence, and a few pairs for scale.
  #shoes(c, y0, innerDepth, W, body, part) {
    const tag = { kind: 'insert', comp: c.index };
    const tilt = THREE.MathUtils.degToRad(14);
    const d = innerDepth - 50;
    const pairs = Math.floor((c.w - 40) / 220);
    if (!this.matCache.has('shoes')) this.matCache.set('shoes', ['#3b2a20', '#e9e7e2', '#20232a', '#8a5a3c'].map((col) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.55, sheen: 0.4 })));
    const shoeMats = this.matCache.get('shoes');
    c.shoes.forEach((t, k) => {
      const y = y0 + t.y + 90;
      const z = 13 + 25 + d / 2;
      const board = part({ w: c.w - 2, h: PANEL, d, x: c.x0 + c.w / 2, y, z, decor: body, grain: 'x', rounded: true, tag });
      board.rotation.x = tilt;
      const front = this.#mesh(new THREE.CylinderGeometry(0.005, 0.005, (c.w - 10) * MM, 16), this.#material('chrome'), c.x0 + c.w / 2, y - Math.sin(tilt) * d / 2 + 45, z + Math.cos(tilt) * d / 2 - 8, tag, W);
      front.rotation.z = Math.PI / 2;
      for (let p = 0; p < pairs; p++) {
        const mat = shoeMats[(p + k) % shoeMats.length];
        for (const side of [-1, 1]) {
          const sx = c.x0 + 40 + 110 + p * 220 + side * 48;
          const shoe = this.#mesh(new RoundedBoxGeometry(0.085, 0.075, 0.26, 3, 0.03), mat, sx, y + 50, z + 20, tag, W);
          shoe.rotation.x = tilt;
        }
      }
    });
  }

  // Pull-out trouser rack hung under a shelf: two runners, a front plate and the bars.
  #trousers(c, y0, innerDepth, W) {
    const tag = { kind: 'insert', comp: c.index };
    const top = y0 + c.trousers.y + 40;
    const d = innerDepth - 60;
    const z = 13 + 30 + d / 2;
    for (const sx of [c.x0 + 16, c.x0 + c.w - 16]) this.#mesh(new THREE.BoxGeometry(0.012, 0.03, d * MM), this.#material('track'), sx, top, z, tag, W);
    this.#mesh(new RoundedBoxGeometry((c.w - 40) * MM, 0.035, 0.016, 2, 0.004), this.#material('track'), c.x0 + c.w / 2, top - 10, z + d / 2, tag, W);
    const bars = Math.max(4, Math.floor((c.w - 80) / 42));
    for (let b = 0; b < bars; b++) {
      const bx = c.x0 + 40 + (b + 0.5) * ((c.w - 80) / bars);
      const bar = this.#mesh(new THREE.CylinderGeometry(0.005, 0.005, d * MM, 12), this.#material('chrome'), bx, top - 22, z, tag, W);
      bar.rotation.x = Math.PI / 2;
    }
  }

  // LED strip under the top panel, near the front. It is a real light source, and like a
  // door sensor it fades in as the doors open.
  #led(c, L, innerDepth, W) {
    const tag = { kind: 'insert', comp: c.index };
    if (!this.matCache.has('led')) this.matCache.set('led', new THREE.MeshStandardMaterial({ color: '#fff7ec', emissive: '#ffd8a8', emissiveIntensity: 0 }));
    const y = L.H - PANEL - 6;
    const z = 13 + innerDepth - 40;
    this.#mesh(new THREE.BoxGeometry((c.w - 40) * MM, 0.008, 0.014), this.matCache.get('led'), c.x0 + c.w / 2, y, z, tag, W).castShadow = false;
    const light = new THREE.RectAreaLight('#ffd9ad', 0, (c.w - 60) * MM, 0.03);
    light.position.set((c.x0 + c.w / 2 - W / 2) * MM, (y - 8) * MM, z * MM);
    light.lookAt(light.position.x, 0, z * MM);
    light.userData.led = true;
    this.wardrobe.add(light);
    this.ledLights.push(light);
  }

  #hingedDoors(state, L, part) {
    const P = PANEL;
    for (const d of L.doors) {
      const pivot = new THREE.Group();
      const left = d.hinge === 'left';
      pivot.position.set(((left ? d.x0 : d.x0 + d.w) - L.W / 2) * MM, 0, (L.D + P / 2 + 1) * MM);
      pivot.userData = { door: d.id, kind: 'hinged', hinge: d.hinge };
      this.wardrobe.add(pivot);
      const sx = left ? d.w / 2 : -d.w / 2;
      const yc = PLINTH + DOOR_GAP / 2 + d.h / 2;
      const tag = { kind: 'door', door: d.id, comp: d.comp };
      part({ w: d.w, h: d.h, d: P, x: sx, y: yc, z: 0, decor: state.decor.front, rounded: true, tag, parent: pivot });
      if (d.mirror) part({ w: d.w - 70, h: d.h - 70, d: 4, x: sx, y: yc, z: P / 2 + 2, mat: this.#material('mirror'), tag, parent: pivot });
      this.#handle(state.doors.handle, pivot, left ? d.w - 42 : -(d.w - 42), yc, d.h, P);
      this.#ensureSpring(d.id);
    }
  }

  #handle(style, parent, x, doorYc, doorH, P) {
    if (style === 'none') return;
    const metal = this.#material('metal');
    if (style === 'bar') {
      const len = 0.34;
      const y = THREE.MathUtils.clamp(1050, doorYc - doorH / 2 + 250, doorYc + doorH / 2 - 250) * MM;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 24), metal);
      bar.position.set(x * MM, y, (P / 2 + 30) * MM);
      bar.castShadow = true;
      parent.add(bar);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 16), metal);
        post.rotation.x = Math.PI / 2;
        post.position.set(x * MM, y + s * (len / 2 - 0.02), (P / 2 + 15) * MM);
        parent.add(post);
      }
    } else if (style === 'edge') {
      const edgeX = x + Math.sign(x) * 36;
      const prof = new THREE.Mesh(new RoundedBoxGeometry(0.014, (doorH - 4) * MM, 0.026, 2, 0.002), metal);
      prof.position.set(edgeX * MM, doorYc * MM, (P / 2 + 4) * MM);
      prof.castShadow = true;
      parent.add(prof);
    }
  }

  #slidingDoors(state, L, part) {
    const P = PANEL;
    const { W, H, D } = L;
    const trackMat = this.#material('track');
    const topY = H - P - 20;
    const botY = PLINTH + P + 6;
    for (const [y, h] of [[topY, 40], [botY, 12]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry((W - 2 * P) * MM, h * MM, 78 * MM), trackMat);
      t.position.set(0, y * MM, (D - 43) * MM);
      t.castShadow = t.receiveShadow = true;
      this.wardrobe.add(t);
    }
    const panelH = topY - 20 - (botY + 6) - 4;
    const yc = botY + 6 + 2 + panelH / 2;
    for (const d of L.doors) {
      const holder = new THREE.Group();
      const z = d.track === 'front' ? D - 22 : D - 52;
      holder.position.set((d.x0 + d.w / 2 - W / 2) * MM, 0, z * MM);
      holder.userData = { door: d.id, kind: 'sliding', shift: d.track === 'front' ? -(d.w - SLIDE_OVERLAP) : 0, base: holder.position.x };
      this.wardrobe.add(holder);
      const tag = { kind: 'door', door: d.id, comp: null };
      part({ w: d.w, h: panelH, d: 18, x: 0, y: yc, z: 0, decor: state.decor.front, rounded: true, tag, parent: holder });
      if (d.mirror) part({ w: d.w - 70, h: panelH - 70, d: 4, x: 0, y: yc, z: 11, mat: this.#material('mirror'), tag, parent: holder });
      if (state.doors.handle !== 'none') {
        for (const s of [-1, 1]) {
          const prof = new THREE.Mesh(new RoundedBoxGeometry(0.016, panelH * MM, 0.024, 2, 0.002), this.#material('metal'));
          prof.position.set(s * (d.w / 2 - 8) * MM, yc * MM, 0.004);
          prof.castShadow = true;
          holder.add(prof);
        }
      }
      this.#ensureSpring(d.id);
    }
  }

  #niche(state, L) {
    this.#clear(this.nicheWalls);
    const gap = state.site.niche - L.W;
    if (gap < 0 || gap > 400) return;
    const h = state.site.ceiling * MM;
    const depth = (L.D + 180) * MM;
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, depth), this.wallMat);
      wall.position.set(s * (state.site.niche / 2 * MM + 0.08), h / 2, depth / 2 - 0.002);
      wall.receiveShadow = wall.castShadow = true;
      this.nicheWalls.add(wall);
    }
  }

  // ---------- helpers: dimensions, selection, ceiling ----------
  #helpers(state, L) {
    this.#clear(this.helpers);
    const { W, H, D } = L;
    const lineMat = new THREE.LineBasicMaterial({ color: '#1d1d1f', transparent: true, opacity: 0.55 });
    const line = (pts) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
      this.helpers.add(new THREE.Line(g, lineMat));
    };
    const label = (text, pos, cls = '') => {
      const el = document.createElement('div');
      el.className = `dim-label ${cls}`;
      el.textContent = text;
      const o = new CSS2DObject(el);
      o.position.set(...pos);
      this.helpers.add(o);
      return o;
    };
    const hx = (W / 2) * MM;
    const off = 0.09;
    this.dims = new THREE.Group();
    // Width, over the top front edge.
    const yTop = H * MM + off;
    line([[-hx, yTop, D * MM], [hx, yTop, D * MM]]);
    line([[-hx, yTop - 0.03, D * MM], [-hx, yTop + 0.03, D * MM]]);
    line([[hx, yTop - 0.03, D * MM], [hx, yTop + 0.03, D * MM]]);
    label(`${cm(W)} ס״מ`, [0, yTop, D * MM]);
    // Height, beside the right side.
    const xr = hx + off;
    line([[xr, 0, D * MM], [xr, H * MM, D * MM]]);
    line([[xr - 0.03, H * MM, D * MM], [xr + 0.03, H * MM, D * MM]]);
    line([[xr - 0.03, 0, D * MM], [xr + 0.03, 0, D * MM]]);
    label(`${cm(H)} ס״מ`, [xr, (H / 2) * MM, D * MM]);
    // Depth, along the top right edge.
    line([[xr, yTop, 0], [xr, yTop, D * MM]]);
    label(`${cm(D)} ס״מ`, [xr, yTop, (D / 2) * MM]);
    // Compartment widths: only useful when the interior is visible.
    this.compLabels = L.comps.map((c) => label(`${cm(c.w)}`, [(c.x0 + c.w / 2 - W / 2) * MM, (H - PANEL - 60) * MM, (L.shelfDepth * 0.6) * MM], 'dim-label--inner'));
    // Ceiling line on the back wall.
    const yc = state.site.ceiling * MM;
    const nx = Math.max(state.site.niche, W) / 2 * MM;
    const dashed = new THREE.LineDashedMaterial({ color: '#86868b', dashSize: 0.04, gapSize: 0.03 });
    const cg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-nx, yc, 0.003), new THREE.Vector3(nx, yc, 0.003)]);
    const cl = new THREE.Line(cg, dashed);
    cl.computeLineDistances();
    this.helpers.add(cl);
    label(`תקרה ${cm(state.site.ceiling)}`, [-nx + 0.18, yc, 0.004], 'dim-label--ceiling');

    // Selection overlay.
    this.selectionBox = null;
    if (this.selected != null && L.comps[this.selected]) this.#selectionOverlay(L.comps[this.selected]);
    this.#applyHelperVisibility();
  }

  #selectionOverlay(c) {
    const L = this.L;
    const box = new THREE.Box3(
      new THREE.Vector3((c.x0 - L.W / 2) * MM, (PLINTH + PANEL) * MM, 0.013),
      new THREE.Vector3((c.x0 + c.w - L.W / 2) * MM, (L.H - PANEL) * MM, L.shelfDepth * MM),
    );
    const g = new THREE.Group();
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fill = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.07, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(fill.geometry), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 }));
    g.add(fill, edges);
    g.position.copy(center);
    this.helpers.add(g);
    this.selectionBox = g;
  }

  select(index) {
    this.selected = index;
    if (this.L) this.#helpers(this.state, this.L);
  }

  /** Briefly pulse a highlight over advisory targets ('carcass' | 'comp:i' | 'door:id'). */
  flash(targets) {
    const L = this.L;
    if (!L) return;
    const boxes = [];
    for (const t of targets) {
      if (t === 'carcass') boxes.push([0, 0, 0, L.W, L.H, L.D]);
      else if (t.startsWith('comp:')) {
        const c = L.comps[Number(t.slice(5))];
        if (c) boxes.push([c.x0, PLINTH + PANEL, 13, c.x0 + c.w, L.H - PANEL, L.shelfDepth]);
      } else if (t.startsWith('door:')) {
        const d = L.doors.find((x) => x.id === t.slice(5));
        if (d) boxes.push([d.x0, PLINTH, L.D - 60, d.x0 + d.w, PLINTH + d.h, L.D + PANEL + 2]);
      }
    }
    for (const [x0, y0, z0, x1, y1, z1] of boxes) {
      const geo = new THREE.BoxGeometry((x1 - x0) * MM + 0.01, (y1 - y0) * MM + 0.01, (z1 - z0) * MM + 0.01);
      const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 }));
      mesh.add(edges);
      mesh.position.set(((x0 + x1) / 2 - L.W / 2) * MM, ((y0 + y1) / 2) * MM, ((z0 + z1) / 2) * MM);
      this.helpers.add(mesh);
      this.flashes.push({ mesh, t: 0 });
    }
  }

  // ---------- view state ----------
  setView(patch) {
    Object.assign(this.view, patch);
    this.#applyHelperVisibility();
  }

  #applyHelperVisibility() {
    const showInner = this.view.doorsOpen || this.state?.doors.type === 'none';
    this.helpers.visible = !this.rendering;
    this.labels.domElement.style.opacity = this.rendering ? '0' : '1';
    for (const o of this.helpers.children) {
      if (o.isCSS2DObject || o.isLine) o.visible = this.view.dims;
    }
    for (const l of this.compLabels ?? []) l.visible = this.view.dims && showInner;
  }

  #ensureSpring(id) {
    if (!this.doorSprings.has(id)) this.doorSprings.set(id, { x: this.view.doorsOpen ? 1 : 0, v: 0 });
  }

  #syncDoors(immediate = false, dt = 0) {
    const target = this.view.doorsOpen ? 1 : 0;
    let moving = false;
    this.wardrobe.traverse((o) => {
      const u = o.userData;
      if (!u?.door || !u.kind || (u.kind !== 'hinged' && u.kind !== 'sliding')) return;
      const s = this.doorSprings.get(u.door);
      if (!s) return;
      if (immediate) { /* keep current spring value */ } else spring(s, target, dt, 0.6);
      if (!settled(s, target)) moving = true;
      if (u.kind === 'hinged') o.rotation.y = (u.hinge === 'left' ? -1 : 1) * DOOR_OPEN * s.x;
      else o.position.x = u.base + u.shift * MM * s.x;
    });
    // LED sensor: brightness follows how far the doors are open (always on without doors).
    const springs = [...this.doorSprings.values()];
    const open = this.state?.doors.type === 'none' ? 1 : springs.length ? Math.max(...springs.map((sp) => sp.x)) : 0;
    const k = THREE.MathUtils.clamp(open, 0, 1);
    for (const l of this.ledLights ?? []) { l.intensity = 9 * k; l.visible = k > 0.02; }
    const ledMat = this.matCache.get('led');
    if (ledMat) ledMat.emissiveIntensity = 2.2 * k;
    return moving;
  }

  // ---------- camera ----------
  frame(name = 'three', animate = true) {
    if (!this.L) return;
    const { W, H, D } = this.L;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect || 1;
    const fitH = (H * MM * 1.18) / 2 / Math.tan(fov / 2);
    const fitW = (W * MM * 1.22) / 2 / Math.tan(fov / 2) / aspect;
    const dist = Math.max(fitH, fitW) + D * MM;
    const az = { front: 0, three: THREE.MathUtils.degToRad(30), side: THREE.MathUtils.degToRad(62) }[name];
    const el = THREE.MathUtils.degToRad(name === 'front' ? 3 : 9);
    const target = new THREE.Vector3(0, H * MM * 0.5, D * MM * 0.5);
    const pos = new THREE.Vector3(Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    if (!animate || reduceMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.camAnim = null;
      return;
    }
    const cur = [...this.camera.position.toArray(), ...this.controls.target.toArray()];
    this.camAnim = { to: [...pos.toArray(), ...target.toArray()], s: cur.map((x) => ({ x, v: 0 })) };
  }

  // ---------- picking ----------
  #setupPicking() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const el = this.renderer.domElement;
    let down = null;
    const hit = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const [h] = ray.intersectObjects(this.pickables ?? [], false);
      if (!h) return null;
      let comp = h.object.userData.comp;
      if (comp == null && this.L) {
        const xmm = h.point.x / MM + this.L.W / 2;
        comp = this.L.comps.findIndex((c) => xmm >= c.x0 - PANEL && xmm <= c.x0 + c.w + PANEL);
        if (comp < 0) comp = null;
      }
      return comp;
    };
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      if (this.rendering) return;
      this.onSelect?.(hit(e));
    });
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      if (raf || e.buttons) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const c = this.rendering ? null : hit(e);
        el.style.cursor = c != null ? 'pointer' : '';
        this.onHover?.(c);
      });
    });
  }

  // ---------- path tracing ----------
  async #pathTracer() {
    if (!this.ptPromise) {
      this.ptPromise = import('three-gpu-pathtracer').then(({ WebGLPathTracer }) => {
        const pt = (this.pt = new WebGLPathTracer(this.renderer));
        pt.bounces = 6;
        pt.filterGlossyFactor = 0.5;
        pt.renderDelay = 0;
        pt.minSamples = 1;
        pt.fadeDuration = 350;
        pt.tiles.set(2, 2);
        return pt;
      });
    }
    return this.ptPromise;
  }

  /**
   * Compile the path-tracing shader while the user is still editing. On Windows (ANGLE/D3D11)
   * the first compile takes tens of seconds; doing it up front makes the Render button instant.
   */
  async prewarm() {
    const pt = await this.#pathTracer();
    if (this.rendering) return;
    await this.ready();
    pt.renderToCanvas = false;
    this.#setPathTracedLights(true);
    pt.setScene(this.scene, this.camera);
    this.#setPathTracedLights(false);
    const step = () => {
      if (this.rendering) return;
      pt.renderSample();
      if (pt.samples === 0 && performance.now() - t0 < 120000) setTimeout(step, 250);
      else { pt.renderToCanvas = true; pt.reset(); this.prewarmed = true; }
    };
    const t0 = performance.now();
    step();
  }

  #setPathTracedLights(on) {
    this.keyLight.visible = !on;
    this.windowLight.visible = on;
  }

  async startRender({ onProgress } = {}) {
    await this.#pathTracer();
    this.pt.renderToCanvas = true;
    await this.ready();
    // The path tracer bakes geometry into a BVH, so moving parts must be at rest first.
    const target = this.view.doorsOpen ? 1 : 0;
    for (const s of this.doorSprings.values()) { s.x = target; s.v = 0; }
    this.#syncDoors(true);
    this.wardrobe.updateMatrixWorld(true);
    // Helpers (selection box, flashes) are UI, not scene: never let the path tracer see them.
    this.selected = null;
    this.flashes.forEach((f) => f.mesh.removeFromParent());
    this.flashes = [];
    if (this.L) this.#helpers(this.state, this.L);
    this.onProgress = onProgress;
    this.rendering = true;
    this.renderDone = false;
    this.#setPathTracedLights(true);
    this.#applyHelperVisibility();
    this.camAnim = null;
    this.pt.setScene(this.scene, this.camera);
  }

  stopRender() {
    this.rendering = false;
    this.renderDone = false;
    this.#setPathTracedLights(false);
    this.#applyHelperVisibility();
  }

  snapshot() {
    return this.renderer.domElement.toDataURL('image/png');
  }

  // ---------- loop ----------
  #resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.rendering && this.pt) { this.pt.updateCamera(); this.renderDone = false; }
  }

  #tick() {
    const now = performance.now();
    const dt = Math.min((now - (this.last ?? now)) / 1000, 1 / 30);
    this.last = now;
    if (this.camAnim) {
      const { s, to } = this.camAnim;
      s.forEach((sp, i) => spring(sp, to[i], dt, 0.5));
      this.camera.position.set(s[0].x, s[1].x, s[2].x);
      this.controls.target.set(s[3].x, s[4].x, s[5].x);
      if (s.every((sp, i) => settled(sp, to[i]))) this.camAnim = null;
      if (this.rendering && this.pt) { this.pt.updateCamera(); this.renderDone = false; }
    }
    this.controls.update();
    if (!this.rendering) this.#syncDoors(false, dt);

    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.min(f.t / 1.3, 1);
      const a = Math.sin(Math.PI * k);
      f.mesh.material.opacity = 0.16 * a;
      f.mesh.children[0].material.opacity = 0.95 * a;
      if (k >= 1) { f.mesh.removeFromParent(); f.mesh.geometry.dispose(); f.done = true; }
    }
    this.flashes = this.flashes.filter((f) => !f.done);

    if (this.rendering && this.pt) {
      if (this.pt.samples < RENDER_SAMPLES) {
        this.pt.renderSample();
        this.onProgress?.(Math.floor(this.pt.samples), RENDER_SAMPLES, this.pt.isCompiling);
      } else if (!this.renderDone) {
        this.renderDone = true;
        this.onProgress?.(RENDER_SAMPLES, RENDER_SAMPLES);
      }
      return;
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  #clear(group) {
    for (const o of [...group.children]) {
      o.removeFromParent();
      o.traverse((c) => {
        c.geometry?.dispose();
        if (c.isCSS2DObject) c.element.remove();
      });
    }
  }
}
