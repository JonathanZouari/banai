// Landing section 2, "Inside": the doors swing open and a damped camera tours the interior,
// one feature at a time, with a callout tied to the part by a thin leader line.
import * as THREE from 'three';
import { el } from '../../editor/fields.js';
import { fill, language } from '../../i18n/strings.js';
import { clamp, damp, lerp, sectionProgress, smoother, windowed } from './motion.js';
import { addShadowFloor, addSun, createStage } from './stage.js';
import { createShowcaseWardrobe } from './wardrobe.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HIGHLIGHT = '#e9814d';
// Camera stops per feature: azimuth and elevation (radians), distance (metres).
const VIEWS = Object.freeze({
  rail: [-0.12, 0.05, 4.3],
  shelf: [0.12, 0.12, 4.3],
  drawer: [0.3, 0.22, 4.2],
  partition: [-0.1, 0.08, 5.8],
  handle: [0.48, 0.06, 6.0],
});
const OVERVIEW = Object.freeze({ target: new THREE.Vector3(0, 1.2, 0), view: [0.5, 0.12, 7] });
const TOUR = [0.08, 0.94]; // the part of the section's scroll the tour spans

/** The features the tour stops at, with real values from the design and catalog. */
export function insideFeatures(design, catalog) {
  const panel = design.carcass.panelThickness;
  const railed = design.compartments.find((c) => c.rails.length);
  const shelved = design.compartments.reduce((best, c) => (c.shelves.length > best.shelves.length ? c : best), design.compartments[0]);
  const shelfYs = shelved.shelves.map((s) => s.y).sort((a, b) => a - b);
  const drawered = design.compartments.find((c) => c.drawers.length);
  return [
    railed && { kind: 'rail', key: 'ldRail', values: { mm: panel + railed.rails[0].y }, ids: railed.rails.map((r) => r.id) },
    shelfYs.length && {
      kind: 'shelf', key: 'ldShelves', values: { count: shelfYs.length, gap: shelfYs.length > 1 ? shelfYs[1] - shelfYs[0] : 0 }, ids: shelved.shelves.map((s) => s.id),
    },
    drawered && {
      kind: 'drawer', key: 'ldDrawers', values: { count: drawered.drawers.length, height: drawered.drawers[0].height }, ids: drawered.drawers.map((d) => d.id),
    },
    design.partitions.length && {
      kind: 'partition', key: 'ldCompartments', values: { count: design.compartments.length, width: design.dimensions.width }, ids: design.partitions.map((p) => p.id),
    },
    design.doors.items.length && {
      kind: 'handle', key: 'ldHandles', values: { styles: catalog.handleStyles.length, finishes: catalog.handleFinishes.length }, ids: null,
    },
  ].filter(Boolean);
}

/** A soft, see-through glow box around a mesh; a child, so it follows a swinging door. */
function glowFor(mesh, material) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3()).addScalar(0.008);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  glow.position.copy(box.getCenter(new THREE.Vector3()));
  glow.renderOrder = 2;
  mesh.add(glow);
  return glow;
}

export function createInside({ design, catalog, reducedMotion }) {
  const features = insideFeatures(design, catalog);
  const slot = el('div', { className: 'landing-slot' });
  const line = document.createElementNS(SVG_NS, 'line');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('r', '4');
  const leaders = document.createElementNS(SVG_NS, 'svg');
  leaders.setAttribute('class', 'landing-inside__leaders');
  leaders.setAttribute('aria-hidden', 'true');
  leaders.append(line, dot);
  const eyebrow = el('span', { className: 'landing-eyebrow' });
  const heading = el('h2', { className: 'landing-inside__title' });
  const count = el('span', { className: 'landing-eyebrow' });
  const cardTitle = el('h3', { className: 'landing-callout__title' });
  const cardText = el('p', { className: 'landing-callout__text' });
  const cardSpec = el('p', { className: 'landing-callout__spec' });
  // Hidden until the tour reaches its first stop.
  const callout = el('div', { className: 'landing-callout landing-callout--hidden', attrs: { 'aria-live': 'polite' } }, [count, cardTitle, cardText, cardSpec]);
  const items = features.map(() => el('li', {}, [el('i', { attrs: { 'aria-hidden': 'true' } }), el('span')]));
  const list = el('ol', { className: 'landing-inside__list' }, items);
  const stageNode = el('div', { className: 'landing-stage landing-inside__stage' }, [
    slot, leaders, el('div', { className: 'landing-inside__head' }, [eyebrow, heading]), callout, list,
  ]);
  const node = el('section', { className: 'landing-inside', attrs: { id: 'landing-inside', 'aria-labelledby': 'landing-inside-title' } }, [stageNode]);
  heading.id = 'landing-inside-title';

  // Built when the section comes near the viewport, not on load.
  let stage = null;
  let wardrobe = null;
  let built = false;
  const stops = [];
  function build3d() {
    built = true;
    stage = createStage(slot, { exposure: 1, environment: 0.55 });
    if (!stage) {
      node.classList.add('landing-inside--static');
      slot.append(el('p', { className: 'landing-fallback', text: language.t('ldNo3d') }));
      return;
    }
    stage.scene.add(new THREE.HemisphereLight('#fffaf4', '#e6d9cf', 0.85));
    addSun(stage.scene, { position: new THREE.Vector3(2.4, 4.2, 4), target: new THREE.Vector3(0, 1, 0), intensity: 2.1, reach: 3.2 });
    addShadowFloor(stage.scene, 0.1);
    wardrobe = createShowcaseWardrobe(design, catalog);
    stage.scene.add(wardrobe.root);
    features.forEach((feature) => {
      const meshes = feature.ids ? feature.ids.map(wardrobe.byId).filter(Boolean) : wardrobe.meshesOf('handle');
      const material = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0, depthWrite: false });
      const anchorMeshes = feature.kind === 'handle' ? meshes.slice(1, 2) : meshes;
      stops.push({ feature, meshes, anchorMeshes, material, glows: meshes.map((m) => glowFor(m, material)), level: 0 });
    });
  }

  const camera = { target: OVERVIEW.target.clone(), view: [...OVERVIEW.view] };
  const leader = { x: 0, y: 0, cx: 0, cy: 0, alpha: 0, placed: false };
  let progress = 0;
  let doors = 0;
  let shown = -1;
  let swapTimer = 0;

  function fillCard(i) {
    const { key, values } = features[i];
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(features.length).padStart(2, '0')}`;
    cardTitle.textContent = language.t(`${key}Title`);
    cardText.textContent = language.t(`${key}Text`);
    cardSpec.textContent = fill(language.t(`${key}Spec`), values);
  }

  function setActive(i) {
    items.forEach((item, k) => item.classList.toggle('is-on', k === i));
    if (i === shown) return;
    const first = shown < 0;
    shown = i;
    clearTimeout(swapTimer);
    if (i < 0) { callout.classList.add('landing-callout--hidden'); return; }
    if (first || reducedMotion()) {
      fillCard(i);
      callout.classList.remove('landing-callout--hidden', 'landing-callout--leaving');
      return;
    }
    // Fade the card out, swap its text while it is invisible, then fade it back in.
    callout.classList.add('landing-callout--leaving');
    swapTimer = setTimeout(() => {
      fillCard(shown);
      callout.classList.remove('landing-callout--leaving', 'landing-callout--hidden');
    }, 320);
  }

  /** Where the camera wants to be for a stop index (-1 is the overview). */
  function viewOf(i) {
    if (i < 0) return OVERVIEW;
    const stop = stops[i];
    const target = wardrobe.frontOf(stop.anchorMeshes);
    target.x += 0.25;
    target.z -= 0.15;
    return { target, view: VIEWS[stop.feature.kind] };
  }

  function update(dt, now, pointer) {
    const rect = node.getBoundingClientRect();
    if (!built && rect.top < window.innerHeight * 1.5 && rect.bottom > 0) build3d();
    const goal = sectionProgress(rect, stageNode.clientHeight);
    const still = reducedMotion();
    progress = still ? goal : damp(progress, goal, 2.4, dt);
    const p = progress;
    const n = features.length;
    // One continuous path through the stops: `s` runs from -1 (overview) to n - 1 (last stop).
    // Each leg eases in and out, so the camera slows into every stop and glides between them.
    const s = p < TOUR[0] ? windowed(p, 0, TOUR[0]) - 1 : windowed(p, TOUR[0], TOUR[1]) * (n - 1);
    const leg = Math.min(n - 2, Math.floor(s));
    const k = smoother(clamp(s - leg));
    const active = p < TOUR[0] * 0.6 ? -1 : clamp(Math.round(s), 0, n - 1);

    if (!stage) {
      if (built) setActive(Math.max(0, active));
      return;
    }
    if (!stage.visible) return;

    const from = viewOf(Math.max(-1, leg));
    const to = viewOf(leg + 1);
    const wantTarget = from.target.clone().lerp(to.target, k);
    const wantView = from.view.map((v, j) => lerp(v, to.view[j], k));
    // Inertia on top: the camera eases toward the path instead of following every scroll tick.
    const settle = still ? 60 : 1.8;
    camera.target.set(
      damp(camera.target.x, wantTarget.x, settle, dt),
      damp(camera.target.y, wantTarget.y, settle, dt),
      damp(camera.target.z, wantTarget.z, settle, dt),
    );
    camera.view = camera.view.map((v, j) => damp(v, wantView[j], settle, dt));
    const narrow = stage.camera.aspect < 1;
    stage.look(camera.target, camera.view[0] + pointer.x * 0.06, camera.view[1] - pointer.y * 0.03, camera.view[2] * (narrow ? 1.6 : 1));
    const rtl = node.closest('[dir]')?.dir === 'rtl';
    stage.shift(narrow ? 0 : (rtl ? -0.14 : 0.14), 0);

    // The doors close as the camera travels to the last stop (doors and handles).
    const wantDoors = still ? 1 : smoother(windowed(p, 0, TOUR[0])) - smoother(windowed(s, n - 1.8, n - 1.15));
    doors = damp(doors, wantDoors, still ? 60 : 2.2, dt);
    wardrobe.setDoors(doors);
    stops.forEach((stop, k2) => {
      stop.level = damp(stop.level, k2 === active ? 1 : 0, still ? 60 : 2.5, dt);
      stop.material.opacity = stop.level * 0.22;
      stop.glows.forEach((g) => { g.visible = stop.level > 0.01; });
    });
    // Place the card before revealing it, so it never fades in at the corner.
    placeLeader(active, dt, narrow || still, rtl);
    setActive(active);
    stage.render();
  }

  function placeLeader(i, dt, hide, rtl) {
    const want = i >= 0 && !hide ? 1 : 0;
    leader.alpha = damp(leader.alpha, want, 3.5, dt);
    leaders.style.opacity = String(leader.alpha);
    if (i < 0) return;
    const point = wardrobe.frontOf(stops[i].anchorMeshes).project(stage.camera);
    const width = stage.width;
    const height = stage.height;
    const x = ((point.x + 1) / 2) * width;
    const y = ((1 - point.y) / 2) * height;
    const cardWidth = callout.offsetWidth;
    const cardHeight = callout.offsetHeight;
    // The card sits beside the part, on the side away from the heading.
    const cx = rtl
      ? clamp(Math.min(x - 140 - cardWidth, width * 0.4 - cardWidth), 24, width - cardWidth - 24)
      : clamp(Math.max(x + 140, width * 0.6), 24, width - cardWidth - 24);
    const cy = clamp(y - cardHeight / 2, 110, height - cardHeight - 24);
    const rate = leader.placed ? 4 : 1000;
    leader.x = damp(leader.x, x, rate, dt);
    leader.y = damp(leader.y, y, rate, dt);
    leader.cx = damp(leader.cx, cx, rate, dt);
    leader.cy = damp(leader.cy, cy, rate, dt);
    leader.placed = true;
    if (!hide) {
      callout.style.left = `${leader.cx}px`;
      callout.style.top = `${leader.cy}px`;
    }
    line.setAttribute('x1', leader.x.toFixed(1));
    line.setAttribute('y1', leader.y.toFixed(1));
    line.setAttribute('x2', (rtl ? leader.cx + cardWidth : leader.cx).toFixed(1));
    line.setAttribute('y2', (leader.cy + 34).toFixed(1));
    dot.setAttribute('cx', leader.x.toFixed(1));
    dot.setAttribute('cy', leader.y.toFixed(1));
  }

  function relabel() {
    eyebrow.textContent = language.t('ldInsideEyebrow');
    heading.textContent = language.t('ldInsideTitle');
    items.forEach((item, k) => { item.lastChild.textContent = language.t(`${features[k].key}Title`); });
    if (shown >= 0) fillCard(shown);
  }

  relabel();
  setActive(-1);
  return {
    node,
    update,
    relabel,
    dispose() {
      clearTimeout(swapTimer);
      stops.forEach((stop) => {
        stop.glows.forEach((g) => g.geometry.dispose());
        stop.material.dispose();
      });
      wardrobe?.dispose();
      stage?.dispose();
    },
  };
}
