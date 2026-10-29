// Landing section 3, "Make it yours": the catalog's materials, colours, finishes and handles,
// applied live to the 3D wardrobe through the same op protocol as the editor. Hover a colour to
// preview it, drag to turn, look inside, shuffle, and take the result into the editor.
import * as THREE from 'three';
import { el } from '../../editor/fields.js';
import { catalogName, fill, language } from '../../i18n/strings.js';
import { damp } from './motion.js';
import { addShadowFloor, addSun, createStage } from './stage.js';
import { createShowcaseWardrobe, SHOWCASE_STYLE, showcaseDesign } from './wardrobe.js';

const SHUFFLE_STEP_MS = 140; // the shuffle changes one row after another
const KEYS = ['color', 'material', 'finish', 'handle', 'handleFinish'];

export function createStudio({ catalog, reducedMotion, onBuild }) {
  const style = { ...SHOWCASE_STYLE };
  const slot = el('div', { className: 'landing-slot' });
  const hint = el('span', { className: 'landing-studio__hint', attrs: { 'aria-hidden': 'true' } });
  const insideLabel = el('span');
  const insideButton = el('button', { className: 'landing-ghost', attrs: { type: 'button', 'aria-pressed': 'false' } }, [insideLabel]);
  insideButton.dataset.testid = 'landing-look-inside';
  const shuffleLabel = el('span');
  const shuffleButton = el('button', { className: 'landing-ghost', attrs: { type: 'button' } }, [shuffleLabel]);
  shuffleButton.dataset.testid = 'landing-shuffle';
  const view = el('div', { className: 'landing-studio__view' }, [
    slot,
    el('div', { className: 'landing-studio__tools' }, [insideButton, shuffleButton]),
    hint,
  ]);
  const eyebrow = el('span', { className: 'landing-eyebrow' });
  const heading = el('h2', { className: 'landing-studio__title', attrs: { id: 'landing-studio-title' } });
  const intro = el('p', { className: 'landing-studio__intro' });
  const selectionName = el('p', { className: 'landing-studio__name' });
  const selectionMeta = el('p', { className: 'landing-studio__meta' });
  const selection = el('div', { className: 'landing-studio__selection', attrs: { 'aria-live': 'polite' } }, [selectionName, selectionMeta]);
  const buildLabel = el('span');
  const buildButton = el('button', { className: 'btn btn--primary landing-studio__build', attrs: { type: 'button' } }, [buildLabel]);
  buildButton.dataset.testid = 'landing-build';
  buildButton.addEventListener('click', () => onBuild({ ...style }));
  const buildNote = el('p', { className: 'landing-studio__note' });

  // One row per choice: a label, then the options as toggle buttons.
  const rows = [
    { key: 'color', labelKey: 'ldStudioColor', items: catalog.colors, swatch: true },
    { key: 'material', labelKey: 'ldStudioMaterial', items: catalog.materials },
    { key: 'finish', labelKey: 'ldStudioFinish', items: catalog.finishes },
    { key: 'handle', labelKey: 'ldStudioHandles', items: catalog.handleStyles },
    { key: 'handleFinish', labelKey: 'ldStudioHandleFinish', items: catalog.handleFinishes, swatch: true },
  ].map((row) => {
    const labelId = `landing-option-${row.key}`;
    const label = el('span', { className: 'landing-option__label', attrs: { id: labelId } });
    const buttons = row.items.map((item) => {
      const button = el('button', {
        className: row.swatch ? 'landing-swatch' : 'landing-chip',
        attrs: { type: 'button', 'aria-pressed': String(style[row.key] === item.id) },
      });
      if (row.swatch) button.style.setProperty('--swatch', item.hex);
      button.dataset.testid = `landing-${row.key}-${item.id}`;
      button.addEventListener('click', () => choose(row.key, item.id));
      if (row.key === 'color') {
        // Hovering a colour previews it on the wardrobe; leaving returns to the chosen one.
        button.addEventListener('pointerenter', () => { preview = new THREE.Color(item.hex); });
        button.addEventListener('pointerleave', () => { preview = null; });
      }
      return button;
    });
    const values = el('div', { className: `landing-option__values${row.swatch ? ' landing-option__values--swatches' : ''}`, attrs: { role: 'group', 'aria-labelledby': labelId } }, buttons);
    return { ...row, label, buttons, node: el('div', { className: 'landing-option' }, [label, values]) };
  });

  const panel = el('div', { className: 'landing-studio__panel' }, [
    el('div', { className: 'landing-studio__head' }, [eyebrow, heading, intro]),
    selection,
    el('div', { className: 'landing-options' }, rows.map((r) => r.node)),
    el('div', { className: 'landing-studio__cta' }, [buildButton, buildNote]),
  ]);
  const node = el('section', { className: 'landing-studio', attrs: { id: 'landing-materials', 'aria-labelledby': 'landing-studio-title' } }, [
    el('div', { className: 'landing-studio__inner' }, [view, panel]),
  ]);

  let stage = null;
  let wardrobe = null;
  let built = false;
  let panels = []; // { material, target } for every panel material, eased toward its target colour
  let preview = null;
  let pulse = 0;
  let doors = 0;
  let open = false;
  let shuffleTimers = [];
  const spin = { angle: 0.5, velocity: 0, dragging: false, lastX: 0, tilt: 0, tiltGoal: 0 };

  function build3d() {
    built = true;
    stage = createStage(slot, { exposure: 1, environment: 0.6, fov: 30 });
    if (!stage) {
      view.classList.add('landing-studio__view--static');
      insideButton.hidden = true;
      slot.append(el('p', { className: 'landing-fallback', text: language.t('ldNo3d') }));
      return;
    }
    stage.scene.add(new THREE.HemisphereLight('#fffaf4', '#ddd2c6', 0.85));
    addSun(stage.scene, { position: new THREE.Vector3(-2.8, 4.4, 3.6), target: new THREE.Vector3(0, 1, 0), intensity: 2.2, reach: 5 });
    addShadowFloor(stage.scene, 0.12);
    rebuild();
  }

  /** Rebuild the wardrobe in the current style; panels ease from the colour they showed before. */
  function rebuild() {
    const shown = panels[0]?.material.color.clone() ?? null;
    wardrobe?.dispose();
    wardrobe = createShowcaseWardrobe(showcaseDesign(catalog, style), catalog);
    wardrobe.setDoors(doors);
    stage.scene.add(wardrobe.root);
    panels = wardrobe.panelMaterials().map((material) => ({ material, target: material.color.clone() }));
    if (shown && !reducedMotion()) panels.forEach(({ material }) => material.color.copy(shown));
  }

  function choose(key, id) {
    if (style[key] === id) return;
    style[key] = id;
    const row = rows.find((r) => r.key === key);
    row.buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(row.items[i].id === id)));
    describe();
    if (!stage) return;
    rebuild();
    pulse = reducedMotion() ? 0 : 1;
  }

  /** A random look, applied one row at a time so the wardrobe visibly changes step by step. */
  function shuffle() {
    shuffleTimers.forEach(clearTimeout);
    const pick = (list, current) => {
      const others = list.filter((item) => item.id !== current);
      return others[Math.floor(Math.random() * others.length)].id;
    };
    const next = Object.fromEntries(KEYS.map((key) => [key, pick(rows.find((r) => r.key === key).items, style[key])]));
    if (reducedMotion()) {
      KEYS.forEach((key) => choose(key, next[key]));
      return;
    }
    shuffleTimers = KEYS.map((key, i) => setTimeout(() => choose(key, next[key]), i * SHUFFLE_STEP_MS));
  }

  insideButton.addEventListener('click', () => {
    open = !open;
    insideButton.setAttribute('aria-pressed', String(open));
  });
  shuffleButton.addEventListener('click', shuffle);
  view.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    spin.dragging = true;
    spin.lastX = event.clientX;
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', (event) => {
    const box = view.getBoundingClientRect();
    spin.tiltGoal = ((event.clientX - box.left) / box.width - 0.5) * 0.35;
    if (!spin.dragging) return;
    spin.velocity = (event.clientX - spin.lastX) * 0.008;
    spin.angle += spin.velocity;
    spin.lastX = event.clientX;
  });
  const release = () => { spin.dragging = false; };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);
  view.addEventListener('pointerleave', () => { spin.tiltGoal = 0; });

  function describe() {
    const name = (list, id) => catalogName(list.find((item) => item.id === id) ?? { id, name: id });
    selectionName.replaceChildren(...name(catalog.colors, style.color).split(' ').flatMap((word, i) => {
      const span = el('span', { className: 'landing-word landing-word--rise', text: word });
      span.style.animationDelay = `${i * 60}ms`;
      return [span, document.createTextNode(' ')];
    }));
    const handle = style.handle === 'none'
      ? name(catalog.handleStyles, style.handle)
      : `${name(catalog.handleStyles, style.handle)}, ${name(catalog.handleFinishes, style.handleFinish)}`;
    selectionMeta.textContent = [name(catalog.materials, style.material), name(catalog.finishes, style.finish), handle].join(' · ');
  }

  function update(dt, now) {
    const rect = node.getBoundingClientRect();
    if (!built && rect.top < window.innerHeight * 1.5 && rect.bottom > 0) build3d();
    if (!stage || !stage.visible) return;
    const still = reducedMotion();
    const rate = still ? 60 : 9;
    panels.forEach(({ material, target }) => {
      const goal = preview ?? target;
      material.color.r = damp(material.color.r, goal.r, rate, dt);
      material.color.g = damp(material.color.g, goal.g, rate, dt);
      material.color.b = damp(material.color.b, goal.b, rate, dt);
    });
    doors = damp(doors, open ? 1 : 0, still ? 60 : 2.4, dt);
    wardrobe.setDoors(doors * 0.85);
    if (!spin.dragging) {
      spin.velocity = damp(spin.velocity, 0, 3, dt);
      spin.angle += spin.velocity;
    }
    spin.tilt = damp(spin.tilt, still ? 0 : spin.tiltGoal, 3, dt);
    pulse = damp(pulse, 0, 4, dt);
    const sway = still ? 0 : Math.sin(now / 3200) * 0.05;
    wardrobe.root.scale.set(1, 1 + Math.sin(pulse * Math.PI) * 0.006, 1);
    const distance = (stage.fit(2.5, 2.4, 1.18) + 0.6) * (1 - 0.035 * Math.sin(pulse * Math.PI));
    stage.look(new THREE.Vector3(0, 1.18, 0), spin.angle + sway + spin.tilt, 0.1, distance);
    stage.render();
  }

  function relabel() {
    eyebrow.textContent = language.t('ldStudioEyebrow');
    heading.textContent = language.t('ldStudioTitle');
    intro.textContent = fill(language.t('ldStudioText'), {
      materials: catalog.materials.length, colors: catalog.colors.length, finishes: catalog.finishes.length, handles: catalog.handleStyles.length,
    });
    hint.textContent = language.t('ldStudioDrag');
    insideLabel.textContent = language.t('ldStudioInside');
    shuffleLabel.textContent = language.t('ldStudioShuffle');
    buildLabel.textContent = language.t('ldStudioBuild');
    buildNote.textContent = language.t('ldStudioBuildNote');
    rows.forEach((row) => {
      row.label.textContent = language.t(row.labelKey);
      row.buttons.forEach((button, i) => {
        const text = catalogName(row.items[i]);
        if (row.swatch) {
          button.setAttribute('aria-label', text);
          button.title = text;
        } else {
          button.textContent = text;
        }
      });
    });
    describe();
  }

  relabel();
  return {
    node,
    update,
    relabel,
    dispose() {
      shuffleTimers.forEach(clearTimeout);
      wardrobe?.dispose();
      stage?.dispose();
    },
  };
}
