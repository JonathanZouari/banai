// Start screen: a scrolling landing page (drawing to room, inside, materials) that ends at the
// ways in. Shown on load as a modal; choosing a way in closes it and opens the one editor.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { LANGUAGES, language } from '../i18n/strings.js';
import { ENTRY_POINTS, getEntryPoint } from './entryPoints.js';
import { createLanding } from './landing/landing.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

// i18n keys of each entry point's texts (English values match entryPoints.js).
const ENTRY_KEYS = Object.freeze({ guided: 'entryGuided', basic: 'entryBasic' });
const LANGUAGE_LABELS = Object.freeze({ en: 'EN', he: 'עברית' });

/** The third card: "Last designs" opens the local archive. Its count follows the archive, in every language. */
function createArchiveCard({ archive, archiveDialog }) {
  const title = el('h2', { className: 'entry-card__title' });
  const badge = el('span', { className: 'archive-badge' });
  badge.dataset.testid = 'archive-count';
  const text = el('p', { className: 'entry-card__text' });
  const actionLabel = el('span');
  const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [actionLabel, document.createTextNode(' '), icon('arrow', { size: 18 })]);
  action.dataset.testid = 'entry-archive';
  const card = el('article', { className: 'entry-card' }, [
    el('span', { className: 'entry-card__icon' }, [icon('history', { size: 24 })]),
    el('div', { className: 'entry-card__heading' }, [title, badge]),
    text,
    action,
  ]);
  const sync = () => {
    const n = archive.isAvailable() ? archive.list().length : 0;
    title.textContent = language.t('arcOpenButton');
    text.textContent = language.t('arcCardText');
    actionLabel.textContent = language.t('arcCardAction');
    badge.textContent = String(n);
    badge.hidden = n === 0;
    action.setAttribute('aria-label', language.t('arcOpenAria').replace('{n}', String(n)));
  };
  action.addEventListener('click', archiveDialog.open);
  archive.subscribe(sync);
  language.subscribe(sync);
  sync();
  return card;
}

/** EN / עברית, like the editor's own switch. */
function createLanguageSwitch() {
  const buttons = LANGUAGES.map((code) => {
    const button = el('button', { className: 'lang-switch__btn', text: LANGUAGE_LABELS[code], attrs: { type: 'button', role: 'radio', lang: code } });
    button.dataset.testid = `landing-lang-${code}`;
    button.addEventListener('click', () => language.set(code));
    return button;
  });
  const node = el('div', { className: 'lang-switch start__lang', attrs: { role: 'radiogroup' } }, buttons);
  const sync = () => {
    buttons.forEach((b, i) => b.setAttribute('aria-checked', String(LANGUAGES[i] === language.get())));
    node.setAttribute('aria-label', language.t('ldLanguageAria'));
  };
  return { node, sync };
}

export function mountStartScreen({ onChoose, onBuild = null, archive = null, archiveDialog = null, catalog = null }) {
  const leave = () => {
    dialog.close();
    dialog.remove();
  };
  const choose = (entry) => {
    leave();
    onChoose(entry);
  };
  const entryTexts = [];
  const cards = ENTRY_POINTS.map((entry) => {
    const actionLabel = el('span', { text: entry.action });
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [actionLabel, document.createTextNode(' '), icon('arrow', { size: 18 })]);
    action.dataset.testid = `entry-${entry.id}`;
    const title = el('h2', { className: 'entry-card__title', text: entry.title });
    const text = el('p', { className: 'entry-card__text', text: entry.description });
    entryTexts.push({ key: ENTRY_KEYS[entry.id], title, text, actionLabel });
    action.addEventListener('click', () => choose(entry));
    return el('article', { className: 'entry-card' }, [
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      title,
      text,
      action,
    ]);
  });
  if (archive && archiveDialog) cards.push(createArchiveCard({ archive, archiveDialog }));

  const startTitle = el('h1', { className: 'start__title', text: 'Design your wardrobe', attrs: { id: 'start-title' } });
  const startSubtitle = el('p', { className: 'start__subtitle' });
  const footnote = el('p', { className: 'start__footnote', text: START_FOOTNOTE });
  const ways = el('main', { className: 'start__main', attrs: { id: 'landing-start' } }, [
    startTitle,
    startSubtitle,
    el('div', { className: 'start__cards' }, cards),
    footnote,
    el('a', { className: 'start__footnote', text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', lang: 'he' } }),
  ]);

  // The landing sections need the catalog (the wardrobe is built from it). Without one the
  // start screen is just the ways in, as before.
  let landing = null;
  try {
    landing = catalog ? createLanding({
      catalog,
      onStart: () => scrollToSection(ways),
      // "Build this wardrobe": open the editor in the look chosen in the studio.
      onBuild: (style) => {
        leave();
        if (onBuild) onBuild(style);
        else onChoose(getEntryPoint('basic'));
      },
    }) : null;
  } catch {
    landing = null; // the ways in must always work, even if the showcase cannot be built
  }

  // Section links scroll inside the start screen. They are buttons, not #anchors: the URL hash
  // is reserved for private design links.
  const scrollToSection = (node) => node.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const navItems = landing ? [
    ['ldNavStory', landing.nodes[0]], ['ldNavInside', landing.nodes[1]], ['ldNavMaterials', landing.nodes[2]],
  ].map(([key, target]) => {
    const button = el('button', { className: 'start__nav-link', attrs: { type: 'button' } });
    button.addEventListener('click', () => scrollToSection(target));
    return { key, button, target };
  }) : [];
  const startLink = el('button', { className: 'btn btn--primary start__nav-start', attrs: { type: 'button' } });
  // "Start designing" goes straight to the designer, with the basic wardrobe.
  startLink.addEventListener('click', () => choose(getEntryPoint('basic')));
  const languageSwitch = createLanguageSwitch();
  const nav = el('nav', { className: 'start__nav' }, [...navItems.map((n) => n.button), languageSwitch.node, startLink]);

  const dialog = el('dialog', { className: `start${landing ? ' start--landing' : ''}`, attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 }), nav]),
    ...(landing ? landing.nodes : []),
    el('section', { className: 'start__ways' }, [ways]),
  ]);
  dialog.dataset.testid = 'start-screen';

  const relabel = () => {
    dialog.lang = language.get();
    dialog.dir = language.dir();
    startTitle.textContent = language.t('startTitle');
    startSubtitle.textContent = language.t('startSubtitle');
    footnote.textContent = language.t('startFootnote');
    entryTexts.forEach(({ key, title, text, actionLabel }) => {
      if (!key) return;
      title.textContent = language.t(`${key}Title`);
      text.textContent = language.t(`${key}Text`);
      actionLabel.textContent = language.t(`${key}Action`);
    });
    nav.setAttribute('aria-label', language.t('ldNavAria'));
    navItems.forEach(({ key, button }) => { button.textContent = language.t(key); });
    startLink.textContent = language.t('ldNavStart');
    languageSwitch.sync();
    landing?.relabel();
  };
  const unsubscribe = language.subscribe(relabel);
  relabel();

  // Mark the section in view in the header.
  const watch = navItems.length ? new IntersectionObserver((entries) => entries.forEach((entry) => {
    const item = navItems.find((n) => n.target === entry.target);
    if (item) item.button.classList.toggle('is-current', entry.isIntersecting);
  }), { root: dialog, rootMargin: '-45% 0px -45% 0px' }) : null;
  navItems.forEach((n) => watch.observe(n.target));

  dialog.addEventListener('close', () => {
    // Focus must not stay inside the closed screen: hand it back to the start of the page, so the
    // next Tab reaches the skip link (callers that open the editor move focus on from here).
    if (dialog.contains(document.activeElement)) {
      document.body.tabIndex = -1;
      document.body.focus({ preventScroll: true });
      document.body.removeAttribute('tabindex');    }
    watch?.disconnect();
    if (typeof unsubscribe === 'function') unsubscribe();
    landing?.dispose();
    landing = null;
  }, { once: true });
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  // First in the page, so once it closes the next Tab continues into the skip link, not out of the page.
  document.body.prepend(dialog);
  dialog.showModal();
  // Focus the first header control (a real control, so closing the screen hands focus back to the
  // page), without a focus ring for a visitor who has not used the keyboard yet.
  // The ring stays hidden until the first key press, then keyboard focus shows as usual.
  dialog.classList.add('start--quiet');
  dialog.addEventListener('keydown', () => dialog.classList.remove('start--quiet'), { once: true });
  nav.querySelector('button')?.focus({ preventScroll: true, focusVisible: false });
  return dialog;
}
