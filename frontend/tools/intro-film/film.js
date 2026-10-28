// The start screen's intro film, rendered offline (render.mjs) from the app's own wardrobe builder.
// Every frame is a pure function of time, so the film renders frame by frame with no clock and no
// randomness. Two cuts: `intro` (the wardrobe assembles itself, 9 s) and `loop` (a seamless 8 s idle
// whose first frame is the intro's last one).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWardrobe } from '../../src/viewer/buildWardrobe.js';
import { FILM_DESIGN, WOOD } from './filmDesign.js';

export const CUTS = Object.freeze({ intro: 9, loop: 8 });

const BACKGROUND = '#0b0807';
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const progress = (t, start, duration) => clamp01((t - start) / duration);
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOutBack = (p) => { const c = 1.4; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };
const smooth = (a, b, t) => { const p = clamp01((t - a) / (b - a)); return p * p * (3 - 2 * p); };
const lerp = (a, b, p) => a + (b - a) * p;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural wood: long vertical grain lines warped by layered sines, plus pores. */
function woodTexture({ base, dark, light }, seed) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const x0 = rand() * size;
    const amp = 4 + rand() * 22;
    const freq = 0.002 + rand() * 0.006;
    const phase = rand() * TAU;
    g.strokeStyle = rand() < 0.62 ? dark : light;
    g.globalAlpha = 0.05 + rand() * 0.22;
    g.lineWidth = 0.6 + rand() * 3.2;
    g.beginPath();
    for (let y = -10; y <= size + 10; y += 8) {
      const x = x0 + amp * Math.sin(y * freq + phase) + 0.35 * amp * Math.sin(y * freq * 3.1 + phase * 2);
      if (y < 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 0.08;
  g.fillStyle = dark;
  for (let i = 0; i < 9000; i += 1) g.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 5);
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The viewer's material interface (see src/viewer/materials.js), dressed for the film. */
function createFilmMaterials() {
  const cache = new Map();
  let seed = 7;
  return {
    forAppearance(appearance) {
      const id = appearance.color.catalogId;
      if (!cache.has(id)) {
        const wood = WOOD[id] ?? WOOD.natural_oak;
        cache.set(id, new THREE.MeshStandardMaterial({ map: woodTexture(wood, (seed += 11)), roughness: wood.roughness, metalness: 0 }));
      }
      return cache.get(id);
    },
    rail: new THREE.MeshStandardMaterial({ color: '#c9a15a', metalness: 1, roughness: 0.28 }),
    hardware: new THREE.MeshStandardMaterial({ color: '#d2a95e', metalness: 1, roughness: 0.22 }),
    doorEdge: new THREE.LineBasicMaterial({ color: '#1a120c', transparent: true, opacity: 0.55 }),
  };
}

/** A soft additive cone: the visible beam of the key light through dusty air. */
function lightBeam() {
  const geometry = new THREE.CylinderGeometry(0.05, 1.6, 6, 64, 1, true);
  geometry.translate(0, -3, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#ffcf9e') } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main() { vY = -position.y / 6.0; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV;
      void main() { float edge = pow(abs(dot(vN, vV)), 2.2); float fall = (1.0 - vY) * smoothstep(0.0, 0.08, vY);
        gl_FragColor = vec4(uColor, uOpacity * edge * fall); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function dustSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,236,214,1)');
  gradient.addColorStop(0.35, 'rgba(255,214,170,0.35)');
  gradient.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Dust motes on closed orbits: periodic in 8 s, so the loop cut has no seam. */
function createDust(count) {
  const rand = mulberry32(42);
  const seeds = Array.from({ length: count }, () => ({
    x: (rand() - 0.5) * 6, y: rand() * 3.4, z: (rand() - 0.5) * 4 + 0.6,
    ax: 0.05 + rand() * 0.25, ay: 0.05 + rand() * 0.3, k: 1 + Math.floor(rand() * 2), phase: rand() * TAU,
  }));
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.022, map: dustSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: '#ffd9b0',
  });
  const points = new THREE.Points(geometry, material);
  points.update = (t) => {
    seeds.forEach((s, i) => {
      const a = (TAU * s.k * t) / CUTS.loop + s.phase;
      positions[i * 3] = s.x + s.ax * Math.sin(a);
      positions[i * 3 + 1] = s.y + s.ay * Math.sin(a * 0.5 + s.phase) * Math.cos(a);
      positions[i * 3 + 2] = s.z + s.ax * Math.cos(a);
    });
    geometry.attributes.position.needsUpdate = true;
  };
  return points;
}

/**
 * Reparent each hinged door (panel, its outline and its handle, built in that order) under a pivot
 * on its hinge edge, so the film can swing it.
 */
function hingeDoors(wardrobe) {
  const pivots = [];
  const children = [...wardrobe.children];
  children.forEach((child, i) => {
    if (child.userData.kind !== 'door') return;
    const width = child.geometry.parameters.width;
    const right = child.userData.hingeSide === 'right';
    const pivot = new THREE.Group();
    pivot.position.set(child.position.x + (right ? width / 2 : -width / 2), 0, child.position.z);
    wardrobe.add(pivot);
    [child, children[i + 1], children[i + 2]].forEach((part) => {
      part.position.sub(pivot.position);
      pivot.add(part);
    });
    pivot.userData.sign = right ? 1 : -1;
    pivots.push(pivot);
  });
  return pivots;
}

/** Where each part flies in from, and when, in the intro cut. */
function assemblyPlan(wardrobe) {
  const plan = [];
  const add = (object, start, from, spin = [0, 0, 0], duration = 1.15) => plan.push({
    object, start, duration, home: object.position.clone(), from: new THREE.Vector3(...from), spin: new THREE.Euler(...spin),
  });
  const kind = (name) => wardrobe.children.filter((c) => c.userData.kind === name);
  const part = (name) => wardrobe.children.find((c) => c.userData.part === name);
  add(part('bottom'), 0.7, [0, -0.9, 0.6], [0.4, 0, 0]);
  add(part('left'), 1.0, [-2.4, 0.3, 0.2], [0, 0, 0.5]);
  add(part('right'), 1.15, [2.4, 0.3, 0.2], [0, 0, -0.5]);
  add(part('back'), 1.4, [0, 0.2, -2.6], [-0.3, 0, 0]);
  add(part('top'), 1.65, [0, 2.6, 0.4], [-0.35, 0, 0]);
  kind('partition').forEach((p, i) => add(p, 1.95 + i * 0.12, [0, 2.8, 0], [0, 0.6, 0]));
  kind('shelf').forEach((p, i) => add(p, 2.35 + i * 0.07, [0, 0.15, 1.8], [0, 0, 0], 0.95));
  kind('rail').forEach((p, i) => add(p, 2.9 + i * 0.1, [0, 0, 1.6], [0, 0, 0], 0.9));
  kind('drawer').forEach((p, i) => add(p, 3.05 + i * 0.1, [0, 0, 1.4], [0, 0, 0], 0.9));
  return plan;
}

export function createFilm(canvas, { width, height, pixelRatio }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.FogExp2(BACKGROUND, 0.085);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#1b1410', roughness: 0.62 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wardrobe = buildWardrobe(FILM_DESIGN, createFilmMaterials(), { doorsVisible: true });
  wardrobe.position.set(-FILM_DESIGN.dimensions.width / 2000, 0, FILM_DESIGN.dimensions.depth / 2000);
  wardrobe.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(wardrobe);
  const plan = assemblyPlan(wardrobe);
  const doors = hingeDoors(wardrobe);

  // Warm LED strips under the top panel of each compartment, and the light they throw.
  const leds = FILM_DESIGN.compartments.map((_, i) => {
    const light = new THREE.PointLight('#ffb36b', 0, 1.6, 1.6);
    const x = -1 + (i + 0.5) * (2 / FILM_DESIGN.compartments.length);
    light.position.set(x, 2.25, 0.05);
    scene.add(light);
    return light;
  });

  const key = new THREE.SpotLight('#ffd6ad', 0, 18, 0.42, 0.75, 1.4);
  key.position.set(-2.6, 5.2, 3.4);
  key.target.position.set(0.1, 1.0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight('#ff8a4c', 0);
  rim.position.set(3.5, 3, -4);
  scene.add(rim);
  const fill = new THREE.HemisphereLight('#7b8aa3', '#120c09', 0);
  scene.add(fill);

  const beam = lightBeam();
  beam.position.copy(key.position);
  beam.lookAt(key.target.position);
  beam.rotateX(-Math.PI / 2);
  scene.add(beam);

  const dust = createDust(520);
  scene.add(dust);

  const camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 60);
  // The wardrobe sits right of centre: the left of the frame belongs to the start screen's text.
  const HERO = { position: new THREE.Vector3(1.55, 1.5, 5.2), target: new THREE.Vector3(-1.05, 1.18, 0) };
  const OPENING = { position: new THREE.Vector3(-2.3, 0.32, 2.4), target: new THREE.Vector3(0.2, 0.9, 0) };

  const setLights = (keyLevel, flicker = 1) => {
    key.intensity = 95 * keyLevel * flicker;
    beam.material.uniforms.uOpacity.value = 0.11 * keyLevel * flicker;
    rim.intensity = 2.4 * keyLevel;
    fill.intensity = 0.28 * keyLevel;
    dust.material.opacity = 0.25 + 0.6 * keyLevel;
  };
  const setDoors = (angle) => doors.forEach((pivot) => { pivot.rotation.y = pivot.userData.sign * angle; });

  function intro(t) {
    // Lights: a dark room, a hesitant switch-on, then full.
    const flicker = t > 0.42 && t < 0.5 ? 0.25 : t > 0.58 && t < 0.62 ? 0.5 : 1;
    setLights(smooth(0.3, 1.5, t), flicker);
    plan.forEach(({ object, start, duration, home, from, spin }) => {
      const p = progress(t, start, duration);
      object.visible = p > 0;
      const e = easeOutExpo(p);
      object.position.copy(home).addScaledVector(from, 1 - e);
      object.rotation.set(spin.x * (1 - e), spin.y * (1 - e), spin.z * (1 - e));
    });
    // Doors fly in wide open from the front, then swing shut together.
    doors.forEach((pivot, i) => {
      const p = progress(t, 3.6 + i * 0.12, 1.1);
      pivot.visible = p > 0;
      pivot.position.z = pivot.userData.homeZ + 2.2 * (1 - easeOutExpo(p));
    });
    const close = progress(t, 5.1, 1.35);
    setDoors(1.75 * (1 - easeOutBack(close)));
    leds.forEach((led) => { led.intensity = 3.2 * (1 - smooth(5.6, 6.3, t)) * smooth(3.4, 4.2, t); });
    // Camera: low and close, rising into the hero framing.
    const c = easeInOutCubic(progress(t, 0, CUTS.intro - 0.4));
    camera.position.lerpVectors(OPENING.position, HERO.position, c);
    const target = new THREE.Vector3().lerpVectors(OPENING.target, HERO.target, c);
    const thud = Math.exp(-14 * Math.max(0, t - 2.75)) * (t > 2.75 ? 1 : 0) * 0.012;
    camera.position.y += thud * Math.sin(t * 90);
    camera.lookAt(target);
    key.target.position.x = lerp(-0.5, 0.1, c);
  }

  function loop(t) {
    setLights(1);
    plan.forEach(({ object, home }) => { object.visible = true; object.position.copy(home); object.rotation.set(0, 0, 0); });
    doors.forEach((pivot) => { pivot.visible = true; pivot.position.z = pivot.userData.homeZ; });
    // One door breathes open on the LED-lit interior and closes again: 0 at both ends of the cut.
    const open = 0.5 - 0.5 * Math.cos((TAU * t) / CUTS.loop);
    setDoors(0);
    doors[doors.length - 1].rotation.y = doors[doors.length - 1].userData.sign * 1.15 * easeInOutCubic(open);
    leds.forEach((led, i) => { led.intensity = i === leds.length - 1 ? 3.6 * open : 0.4 * open; });
    const a = Math.sin((TAU * t) / CUTS.loop);
    camera.position.set(HERO.position.x + 0.45 * a, HERO.position.y + 0.06 * (1 - Math.cos((TAU * t) / CUTS.loop)), HERO.position.z - 0.12 * Math.abs(a));
    camera.lookAt(HERO.target);
    key.target.position.x = 0.1 + 0.25 * Math.sin((TAU * t) / CUTS.loop);
  }

  doors.forEach((pivot) => { pivot.userData.homeZ = pivot.position.z; });

  return {
    renderAt(cut, t) {
      (cut === 'intro' ? intro : loop)(t);
      dust.update(t);
      renderer.render(scene, camera);
    },
    gpu() {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    },
  };
}
