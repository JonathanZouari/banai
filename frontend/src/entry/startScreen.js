// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { ENTRY_POINTS } from './entryPoints.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

function makeSvg(attrs, children) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const child of children) {
    if (typeof child === 'string') {
      const tmp = document.createElementNS(ns, 'g');
      tmp.innerHTML = child;
      while (tmp.firstChild) svg.appendChild(tmp.firstChild);
    } else {
      svg.appendChild(child);
    }
  }
  return svg;
}

function illustrationGuided() {
  const c = getComputedStyle(document.documentElement);
  const primary = c.getPropertyValue('--md-sys-color-primary').trim() || '#b4532a';
  const onSurf = c.getPropertyValue('--md-sys-color-on-surface-variant').trim() || '#6b5c52';
  const surf = c.getPropertyValue('--md-sys-color-surface-container').trim() || '#f5ede8';

  const wrap = document.createElement('div');
  wrap.className = 'entry-card__illustration';
  wrap.innerHTML = `<svg class="illus-guided" viewBox="0 0 200 110" width="200" height="110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- AI bubble (left) -->
    <rect class="bubble-q" x="12" y="12" width="100" height="36" rx="10" fill="${surf}" stroke="${primary}" stroke-width="1.5"/>
    <text class="bubble-q" x="24" y="28" font-size="9" fill="${onSurf}" font-family="sans-serif">What size is your</text>
    <text class="bubble-q" x="24" y="40" font-size="9" fill="${onSurf}" font-family="sans-serif">wardrobe space?</text>
    <!-- User bubble (right) -->
    <rect class="bubble-a" x="88" y="56" width="100" height="30" rx="10" fill="${primary}" opacity="0.15" stroke="${primary}" stroke-width="1.5"/>
    <circle class="dot1" cx="118" cy="71" r="3" fill="${primary}"/>
    <circle class="dot2" cx="130" cy="71" r="3" fill="${primary}"/>
    <circle class="dot3" cx="142" cy="71" r="3" fill="${primary}"/>
  </svg>`;
  return wrap;
}

function illustrationFreeText() {
  const c = getComputedStyle(document.documentElement);
  const primary = c.getPropertyValue('--md-sys-color-primary').trim() || '#b4532a';
  const onSurf = c.getPropertyValue('--md-sys-color-on-surface-variant').trim() || '#6b5c52';
  const surf = c.getPropertyValue('--md-sys-color-surface-container').trim() || '#f5ede8';

  const wrap = document.createElement('div');
  wrap.className = 'entry-card__illustration';
  wrap.innerHTML = `<svg class="illus-free" viewBox="0 0 200 110" width="200" height="110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Notepad background -->
    <rect x="30" y="10" width="140" height="90" rx="8" fill="${surf}" stroke="${onSurf}" stroke-width="1" opacity="0.5"/>
    <rect x="30" y="10" width="140" height="18" rx="8" fill="${primary}" opacity="0.12"/>
    <!-- Text lines -->
    <line class="line1" x1="46" y1="42" x2="154" y2="42" stroke="${primary}" stroke-width="2" stroke-linecap="round"/>
    <line class="line2" x1="46" y1="58" x2="128" y2="58" stroke="${onSurf}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <line class="line3" x1="46" y1="74" x2="140" y2="74" stroke="${onSurf}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <!-- Blinking cursor -->
    <rect class="cursor" x="144" y="66" width="2" height="14" rx="1" fill="${primary}"/>
    <!-- Pencil icon -->
    <g transform="translate(152, 18) rotate(-45)">
      <rect x="0" y="0" width="6" height="16" rx="1" fill="${primary}" opacity="0.8"/>
      <polygon points="0,16 6,16 3,22" fill="${primary}" opacity="0.8"/>
    </g>
  </svg>`;
  return wrap;
}

function illustrationBasic() {
  const c = getComputedStyle(document.documentElement);
  const primary = c.getPropertyValue('--md-sys-color-primary').trim() || '#b4532a';
  const onSurf = c.getPropertyValue('--md-sys-color-on-surface-variant').trim() || '#6b5c52';
  const surf = c.getPropertyValue('--md-sys-color-surface-container').trim() || '#f5ede8';

  // Four mini-wardrobes, one per template preset (basic · kids · couple · minimal).
  // Each has a small label and a distinct internal silhouette so the user can
  // immediately see the variety before choosing.
  const wardrobes = [
    // Basic 200 cm — 2 compartments, shelves + rail
    { x: 6,   w: 38, label: '200', delay: 0,   inner: `
      <line x1="25" y1="28" x2="25" y2="82" stroke="${onSurf}" stroke-width="0.6" opacity="0.4"/>
      <line x1="9"  y1="50" x2="23" y2="50" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="9"  y1="62" x2="23" y2="62" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="27" y1="40" x2="42" y2="40" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="27" y1="55" x2="42" y2="55" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="27" y1="70" x2="42" y2="70" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>` },
    // Kids 150 cm — narrow, lots of shelves
    { x: 54,  w: 30, label: '150', delay: 80,  inner: `
      <line x1="57" y1="35" x2="82" y2="35" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="57" y1="48" x2="82" y2="48" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="57" y1="61" x2="82" y2="61" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="57" y1="74" x2="82" y2="74" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <!-- hanging rail left -->
      <line x1="57" y1="40" x2="67" y2="40" stroke="${onSurf}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>` },
    // Couple 240 cm — widest, his/her sides
    { x: 94,  w: 54, label: '240', delay: 160, inner: `
      <line x1="97"  y1="28" x2="97"  y2="82" stroke="${onSurf}" stroke-width="0.6" opacity="0.4"/>
      <line x1="121" y1="28" x2="121" y2="82" stroke="${onSurf}" stroke-width="0.6" opacity="0.4"/>
      <!-- his rails -->
      <line x1="97"  y1="44" x2="119" y2="44" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <!-- her shelves -->
      <line x1="123" y1="40" x2="146" y2="40" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="123" y1="54" x2="146" y2="54" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <line x1="123" y1="68" x2="146" y2="68" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
      <!-- drawers left -->
      <rect x="97" y="60" width="22" height="7" rx="1" fill="${primary}" opacity="0.18" stroke="${primary}" stroke-width="0.6"/>
      <rect x="97" y="69" width="22" height="7" rx="1" fill="${primary}" opacity="0.18" stroke="${primary}" stroke-width="0.6"/>` },
    // Minimal 180 cm — clean, just rail + one shelf
    { x: 158, w: 36, label: '180', delay: 240, inner: `
      <line x1="161" y1="38" x2="192" y2="38" stroke="${primary}" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>
      <line x1="161" y1="70" x2="192" y2="70" stroke="${primary}" stroke-width="1" stroke-linecap="round" opacity="0.9"/>` },
  ];

  const boxes = wardrobes.map(({ x, w, label, delay, inner }) => `
    <g class="illus-tmpl" style="animation-delay:${delay}ms">
      <rect x="${x}" y="20" width="${w}" height="70" rx="3" fill="${surf}" stroke="${onSurf}" stroke-width="1.2" opacity="0.7"/>
      ${inner}
      <text x="${x + w / 2}" y="100" text-anchor="middle" font-size="7" font-family="sans-serif" fill="${onSurf}" opacity="0.8">${label}</text>
    </g>`).join('');

  const wrap = document.createElement('div');
  wrap.className = 'entry-card__illustration';
  wrap.innerHTML = `<svg class="illus-basic" viewBox="0 0 200 110" width="200" height="110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${boxes}
  </svg>`;
  return wrap;
}

const ILLUSTRATIONS = { guided: illustrationGuided, freeText: illustrationFreeText, basic: illustrationBasic };

export function mountStartScreen({ onChoose }) {
  const cards = ENTRY_POINTS.map((entry) => {
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${entry.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    const illus = ILLUSTRATIONS[entry.id] ? ILLUSTRATIONS[entry.id]() : null;
    const card = el('article', { className: 'entry-card' }, [
      ...(illus ? [illus] : []),
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      el('h2', { className: 'entry-card__title', text: entry.title }),
      el('p', { className: 'entry-card__text', text: entry.description }),
      action,
    ]);
    action.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      onChoose(entry);
    });
    return card;
  });

  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 })]),
    el('main', { className: 'start__main' }, [
      el('h1', { className: 'start__title', text: 'Design your wardrobe', attrs: { id: 'start-title' } }),
      el('p', { className: 'start__subtitle', text: 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.' }),
      el('div', { className: 'start__cards' }, cards),
      el('p', { className: 'start__footnote', text: START_FOOTNOTE }),
      el('a', { className: 'start__footnote', text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', lang: 'he' } }),
    ]),
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
