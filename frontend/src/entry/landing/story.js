// Landing section 1, "from drawing to room": a pinned stage that scroll drives through five beats.
// The elevation draws itself, takes its dimensions, softly dissolves into the live 3D wardrobe,
// the camera pulls back into a furnished room, and the room fades into a photoreal still.
import * as THREE from 'three';
import { el } from '../../editor/fields.js';
import { language } from '../../i18n/strings.js';
import { toM } from '../../viewer/units.js';
import { elevationPaths } from './elevation.js';
import { beatAt, damp, lerp, sectionProgress, smoother, windowed } from './motion.js';
import { createRoom } from './room.js';
import { addSun, createStage } from './stage.js';
import { createShowcaseWardrobe } from './wardrobe.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// ASSUMPTION: the photoreal still is a static, pre-rendered asset (AI-rendered from this scene once).
export const PHOTO_SRC = '/landing/scandi-room.jpg';
export const STORY_BEATS = Object.freeze([
  { at: 0, key: 'ldStory1' },
  { at: 0.18, key: 'ldStory2' },
  { at: 0.34, key: 'ldStory3' },
  { at: 0.56, key: 'ldStory4' },
  { at: 0.8, key: 'ldStory5', end: true },
]);
const STEP_ENDS = [0.18, 0.34, 0.56, 0.8, 1];

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  node.append(...children);
  return node;
}

/** The front elevation with its overall dimensions, every line ready to be drawn on scroll. */
function drawing(design) {
  const { width, height, paths } = elevationPaths(design);
  const pad = 230;
  const lines = paths.map(({ d }) => svg('path', { class: 'landing-drawing__line', d, pathLength: 1 }));
  const label = (text, attrs) => {
    const node = svg('text', { class: 'landing-drawing__label', 'text-anchor': 'middle', ...attrs });
    node.textContent = text;
    return node;
  };
  const dims = svg('g', { class: 'landing-drawing__dims' }, [
    svg('path', { class: 'landing-drawing__dim', d: `M0 ${height + 110}H${width}M0 ${height + 70}V${height + 150}M${width} ${height + 70}V${height + 150}` }),
    label(`${width} mm`, { x: width / 2, y: height + 200 }),
    svg('path', { class: 'landing-drawing__dim', d: `M${width + 110} 0V${height}M${width + 70} 0H${width + 150}M${width + 70} ${height}H${width + 150}` }),
    label(`${height} mm`, { x: width + 160, y: height / 2, transform: `rotate(90 ${width + 160} ${height / 2})` }),
  ]);
  const root = svg('svg', {
    viewBox: `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false',
  }, [...lines, dims]);
  return { root, lines, dims };
}

/** Split a title into words that rise in one after another. */
function setWords(node, text, animate) {
  node.replaceChildren();
  text.split(' ').forEach((word, i) => {
    const span = el('span', { className: 'landing-word', text: word });
    if (animate) {
      span.style.transitionDelay = `${i * 60}ms`;
      span.classList.add('landing-word--pending');
    }
    node.append(span, document.createTextNode(' '));
  });
  if (animate) requestAnimationFrame(() => requestAnimationFrame(() => node.querySelectorAll('.landing-word--pending').forEach((w) => w.classList.remove('landing-word--pending'))));
}

export function createStory({ design, catalog, reducedMotion, onStart }) {
  const art = drawing(design);
  const slot = el('div', { className: 'landing-slot' });
  const photo = el('img', { className: 'landing-story__photo', attrs: { decoding: 'async', alt: '' } });
  photo.hidden = true;
  const eyebrow = el('span', { className: 'landing-eyebrow' });
  const title = el('p', { className: 'landing-story__title' });
  const text = el('p', { className: 'landing-story__text' });
  const note = el('p', { className: 'landing-story__note' });
  note.hidden = true;
  const ctaLabel = el('span');
  const cta = el('button', { className: 'btn btn--primary landing-story__cta', attrs: { type: 'button' } }, [ctaLabel]);
  cta.hidden = true;
  cta.addEventListener('click', onStart);
  const animated = el('div', { className: 'landing-story__beat', attrs: { 'aria-hidden': 'true' } }, [eyebrow, title, text]);
  const readable = el('ol', { className: 'landing-sr' });
  const bars = STEP_ENDS.map(() => el('b'));
  const badge = el('span', { className: 'landing-badge', attrs: { 'aria-hidden': 'true' } });
  const stageNode = el('div', { className: 'landing-stage landing-story__stage' }, [
    el('div', { className: 'landing-story__grid' }),
    el('div', { className: 'landing-story__drawing' }, [art.root]),
    slot,
    photo,
    el('div', { className: 'landing-story__veil' }),
    el('div', { className: 'landing-story__copy' }, [animated, readable, note, cta]),
    el('div', { className: 'landing-steps', attrs: { 'aria-hidden': 'true' } }, bars.map((b) => el('i', {}, [b]))),
    badge,
  ]);
  const node = el('section', { className: 'landing-story', attrs: { id: 'landing-story' } }, [stageNode]);
  const drawingNode = stageNode.querySelector('.landing-story__drawing');
  const grid = stageNode.querySelector('.landing-story__grid');
  const veil = stageNode.querySelector('.landing-story__veil');

  let photoReady = false;
  photo.addEventListener('load', () => { photoReady = true; photo.hidden = false; });
  photo.addEventListener('error', () => { photoReady = false; photo.hidden = true; });
  // The still is only needed at the end of the story: fetch it once the page has settled.
  const loadPhoto = () => { if (!photo.src) photo.src = PHOTO_SRC; };
  const photoTimer = setTimeout(loadPhoto, 1200);

  // The 3D scene is built lazily: once the visitor starts scrolling, or when the browser is idle.
  // The start screen appears at once, and a visitor who picks a way in right away never pays for it.
  let stage = null;
  let wardrobe = null;
  let room = null;
  let built = false;
  function build3d() {
    if (built) return;
    built = true;
    stage = createStage(slot, { exposure: 0.95, environment: 0.5 });
    if (!stage) {
      slot.append(el('p', { className: 'landing-fallback', text: language.t('ldNo3d') }));
      return;
    }
    stage.scene.add(new THREE.HemisphereLight('#fffaf2', '#d9c6b0', 0.9));
    addSun(stage.scene, { position: new THREE.Vector3(-7, 4.6, 2.6), target: new THREE.Vector3(0.2, 0.4, 0.6), intensity: 3.2, reach: 3.8 });
    const fill = new THREE.DirectionalLight('#ffe9d6', 0.35);
    fill.position.set(3, 2.5, 4);
    stage.scene.add(fill);
    room = createRoom();
    stage.scene.add(room.group);
    wardrobe = createShowcaseWardrobe(design, catalog);
    stage.scene.add(wardrobe.root);
  }
  const idle = window.requestIdleCallback ? window.requestIdleCallback(build3d, { timeout: 4000 }) : setTimeout(build3d, 2000);

  const width = toM(design.dimensions.width);
  const height = toM(design.dimensions.height);
  const front = new THREE.Vector3(0, height / 2, 0);
  const finished = new THREE.Vector3(-0.35, height * 0.47, 0.35);
  let progress = reducedMotion() ? 1 : 0;
  let beat = -1;

  function showBeat(index) {
    beat = index;
    const { key, end } = STORY_BEATS[index];
    eyebrow.textContent = language.t(`${key}Eyebrow`);
    setWords(title, language.t(`${key}Title`), !reducedMotion());
    text.textContent = language.t(`${key}Text`);
    cta.hidden = !end;
    note.hidden = !(end && photoReady);
  }

  function relabel() {
    readable.replaceChildren(...STORY_BEATS.map(({ key }) => el('li', { text: `${language.t(`${key}Title`)} ${language.t(`${key}Text`)}` })));
    node.setAttribute('aria-label', language.t('ldStoryAria'));
    photo.alt = language.t('ldPhotoAlt');
    note.textContent = language.t('ldStoryNote');
    ctaLabel.textContent = language.t('ldStoryCta');
    badge.textContent = language.t('ldLive3d');
    if (beat >= 0) showBeat(beat);
  }

  function update(dt, now, pointer) {
    const target = sectionProgress(node.getBoundingClientRect(), stageNode.clientHeight);
    if (reducedMotion()) progress = 1;
    else progress = damp(progress, target, 6, dt);
    const p = progress;
    if (p > 0.08) build3d();
    if (p > 0.5) loadPhoto();

    art.lines.forEach((line, i) => {
      const start = 0.01 + 0.15 * (i / art.lines.length);
      line.style.strokeDashoffset = String(1 - smoother(windowed(p, start, start + 0.07)));
    });
    art.dims.style.opacity = String(smoother(windowed(p, 0.17, 0.26)));
    // Drawing → model: a long, overlapping dissolve. The model arrives blurred and pale, like
    // ink soaking into paper, and sharpens while the drawing lingers and fades.
    const arrive = smoother(windowed(p, 0.26, 0.46));
    const focus = smoother(windowed(p, 0.3, 0.54));
    const drawingFade = smoother(windowed(p, 0.34, 0.58));
    drawingNode.style.opacity = String(1 - drawingFade);
    drawingNode.style.transform = `scale(${1 + drawingFade * 0.03})`;
    grid.style.opacity = String(1 - smoother(windowed(p, 0.3, 0.56)) * 0.92);
    veil.style.opacity = String(smoother(windowed(p, 0.3, 0.5)));
    const toPhoto = photoReady ? smoother(windowed(p, built && !stage ? 0.34 : 0.8, built && !stage ? 0.52 : 0.93)) : 0;
    slot.style.opacity = String(arrive);
    const blur = (1 - focus) * 14 + toPhoto * 8;
    slot.style.filter = blur > 0.05 || focus < 1 ? `blur(${blur.toFixed(2)}px) saturate(${(0.25 + 0.75 * focus).toFixed(3)})` : '';
    photo.style.opacity = String(toPhoto);
    photo.style.filter = toPhoto < 1 ? `blur(${((1 - toPhoto) * 8).toFixed(2)}px)` : '';
    photo.style.transform = `scale(${(lerp(1.05, 1, toPhoto) + Math.max(0, p - 0.93) * 0.3).toFixed(4)})`;
    badge.classList.toggle('landing-badge--on', Boolean(stage) && focus > 0.6 && toPhoto <= 0);
    const index = beatAt(STORY_BEATS, p);
    if (index !== beat) showBeat(index);
    // The AI label shows whenever any of the AI image is on screen (earlier when there is no 3D).
    note.hidden = !(photoReady && (toPhoto > 0.01 || STORY_BEATS[index].end));
    bars.forEach((bar, i) => { bar.style.transform = `scaleX(${windowed(p, i ? STEP_ENDS[i - 1] : 0, STEP_ENDS[i])})`; });

    if (!stage || !stage.visible || arrive <= 0) return;
    room.props.forEach((prop, i) => {
      const t = smoother(windowed(p, 0.5 + i * 0.03, 0.66 + i * 0.03));
      prop.visible = t > 0.001;
      prop.scale.setScalar(lerp(0.9, 1, t));
      prop.position.y = prop.userData.base.y + (1 - t) * 0.2;
    });
    const narrow = stage.camera.aspect < 1;
    const cam = smoother(windowed(p, 0.36, 0.8));
    const sway = reducedMotion() ? 0 : Math.sin(now / 6000) * 0.01 * cam;
    stage.look(
      front.clone().lerp(finished, cam),
      lerp(0, 0.5, cam) + pointer.x * 0.05 * cam + sway,
      lerp(0.02, 0.1, cam) - pointer.y * 0.025 * cam,
      lerp(stage.fit(width, height, 1.45) + 0.3, narrow ? 8.8 : 6.6, cam),
    );
    const side = node.closest('[dir]')?.dir === 'rtl' ? -1 : 1; // the scene sits opposite the copy
    if (narrow) stage.shift(0, lerp(0.12, 0, cam)); // below the copy on a phone
    else stage.shift(side * lerp(0.17, 0.08, cam), 0);
    stage.render();
  }

  relabel();
  showBeat(beatAt(STORY_BEATS, progress));
  return {
    node,
    update,
    relabel,
    dispose() {
      clearTimeout(photoTimer);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
      wardrobe?.dispose();
      room?.dispose();
      stage?.dispose();
    },
  };
}
