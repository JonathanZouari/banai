// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
// It opens on the intro film (public/intro, rendered by tools/intro-film from the app's own wardrobe
// builder): the wardrobe assembles itself, then an idle loop plays behind the choices.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { ENTRY_POINTS } from './entryPoints.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';
const TITLE_WORDS = ['Design', 'your', 'wardrobe'];

function filmVideo(cut, { autoplay, loop }) {
  const video = el('video', { className: `start__film start__film--${cut}`, attrs: { muted: '', playsinline: '', preload: 'auto', 'aria-hidden': 'true', poster: '/intro/poster.jpg' } });
  video.muted = true; // the attribute alone does not allow autoplay in every browser
  video.autoplay = autoplay;
  video.loop = loop;
  // H.264 first: it decodes everywhere, while some Chromium builds fail on VP9 mid-stream (no fallback then).
  ['mp4', 'webm'].forEach((type) => video.append(el('source', { attrs: { src: `/intro/${cut}.${type}`, type: `video/${type}` } })));
  return video;
}

/** Cursor-following glow and a slight 3D tilt on each card. */
function bindTilt(card) {
  card.addEventListener('pointermove', (event) => {
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    card.style.setProperty('--rx', `${(0.5 - y) * 6}deg`);
    card.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
  });
  card.addEventListener('pointerleave', () => ['--rx', '--ry'].forEach((p) => card.style.setProperty(p, '0deg')));
}

export function mountStartScreen({ onChoose }) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = ENTRY_POINTS.map((entry, i) => {
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${entry.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    const card = el('article', { className: 'entry-card' }, [
      el('span', { className: 'entry-card__index', text: `0${i + 1}`, attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      el('h2', { className: 'entry-card__title', text: entry.title }),
      el('p', { className: 'entry-card__text', text: entry.description }),
      action,
    ]);
    bindTilt(card);
    action.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      onChoose(entry);
    });
    return card;
  });

  const intro = filmVideo('intro', { autoplay: !still, loop: false });
  const idle = filmVideo('loop', { autoplay: false, loop: true });
  const stage = el('div', { className: 'start__stage', attrs: { 'aria-hidden': 'true' } }, [intro, idle, el('div', { className: 'start__shade' }), el('div', { className: 'start__grain' })]);
  let paused = still;
  const toLoop = () => {
    if (dialog.classList.contains('is-looping')) return;
    dialog.classList.add('is-looping');
    if (!paused) idle.play().catch(() => {});
  };
  intro.addEventListener('ended', toLoop);

  // WCAG 2.2.2: moving content that plays longer than 5 s can be paused.
  const motion = el('button', { className: 'start__chip', attrs: { type: 'button', 'aria-pressed': String(still) } });
  const setMotionLabel = () => { motion.textContent = paused ? 'Play film' : 'Pause film'; };
  setMotionLabel();
  motion.addEventListener('click', () => {
    paused = !paused;
    motion.setAttribute('aria-pressed', String(paused));
    const active = dialog.classList.contains('is-looping') ? idle : intro;
    if (paused) active.pause(); else active.play().catch(() => {});
    setMotionLabel();
  });
  const skip = el('button', { className: 'start__chip', text: 'Skip intro', attrs: { type: 'button' } });
  skip.addEventListener('click', () => {
    intro.pause();
    dialog.classList.add('is-skipped');
    toLoop();
    skip.remove();
  });

  const title = el('h1', { className: 'start__title', attrs: { id: 'start-title', 'aria-label': TITLE_WORDS.join(' ') } },
    TITLE_WORDS.map((word, i) => el('span', { className: 'start__word', attrs: { 'aria-hidden': 'true', style: `--i:${i}` } }, [el('span', { text: word })])));

  const dialog = el('dialog', { className: `start start--cinema${still ? ' is-still' : ''}`, attrs: { 'aria-labelledby': 'start-title' } }, [
    stage,
    el('div', { className: 'start__letterbox start__letterbox--top', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'start__letterbox start__letterbox--bottom', attrs: { 'aria-hidden': 'true' } }),
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 }), el('div', { className: 'start__controls' }, [skip, motion])]),
    el('main', { className: 'start__main' }, [
      el('div', { className: 'start__hero' }, [
        el('p', { className: 'start__eyebrow', text: 'AI wardrobe studio' }),
        title,
        el('div', { className: 'start__measure', attrs: { 'aria-hidden': 'true' } }, [el('span', { className: 'start__measure-line' }), el('span', { className: 'start__measure-label', text: '2000 mm' })]),
        el('p', { className: 'start__subtitle', text: 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.' }),
      ]),
      el('div', { className: 'start__cards' }, cards),
      el('p', { className: 'start__footnote' }, [
        document.createTextNode(`${START_FOOTNOTE} `),
        el('a', { text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', lang: 'he' } }),
      ]),
    ]),
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  if (still) toLoop(); else intro.play().catch(toLoop); // autoplay blocked: go straight to the idle film
  return dialog;
}
