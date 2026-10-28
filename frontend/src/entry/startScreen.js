// Start screen: the AI designer (guided or free text) or a template from the gallery; all of them
// land in the same editor. Shown on load as a modal; choosing an option closes it. It speaks the
// chat language (he/en, its own switch), and a choice made here carries over to the chat.
//
// The gallery is one Tab stop (roving focus): arrow keys follow the reading direction, Home/End
// jump, Enter/Space choose. Each card is a button named by its template and described by its story,
// its features and its thumbnail's alt text, which is measured from the design (templates.js).
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { LANGUAGES } from '../chat/i18n.js';
import { buildTemplate, TEMPLATE_OPS } from '../domain/presets.js';
import { elevationSvg } from './elevation.js';
import { ENTRY_POINTS, getEntryPoint } from './entryPoints.js';
import { templateAlt, templateFeatures, templateSize } from './templates.js';
import { createThumbnailQueue, withoutDoors } from './thumbnails.js';

const LANGUAGE_NAMES = Object.freeze({ he: 'עב', en: 'EN' });
const AI_ENTRIES = ENTRY_POINTS.filter((entry) => entry.focusesChat);

/** The entry a template card opens: the spec's basic entry point, or a template that replaces the design. */
export const templateEntry = (templateId) => (templateId === 'basic'
  ? { ...getEntryPoint('basic'), templateId }
  : { id: `template-${templateId}`, templateId, focusesChat: false });

function rovingFocus(list, isRtl) {
  list.addEventListener('keydown', (event) => {
    const items = [...list.querySelectorAll('.tpl')];
    const index = items.indexOf(document.activeElement);
    if (index < 0) return;
    const step = { ArrowRight: isRtl() ? -1 : 1, ArrowLeft: isRtl() ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
    let next = step === undefined ? { Home: 0, End: items.length - 1 }[event.key] : index + step;
    if (next === undefined) return;
    event.preventDefault();
    next = (next + items.length) % items.length;
    items[index].tabIndex = -1;
    items[next].tabIndex = 0;
    items[next].focus();
    items[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/**
 * language: the chat language (createLanguage). catalog: validated catalog for the templates.
 * onChoose(entry): entry.focusesChat for the AI entries, entry.templateId for a template.
 */
export function mountStartScreen({ onChoose, language, catalog }) {
  const designs = Object.fromEntries(Object.keys(TEMPLATE_OPS).map((id) => [id, buildTemplate(id, catalog)]));
  const pictures = {}; // id -> { front?, inside?, failed? }, kept across language switches
  const queue = createThumbnailQueue({ catalog });
  let focused = 0; // the gallery's current Tab stop
  let view = null;

  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } });
  dialog.dataset.testid = 'start-screen';

  let unsubscribe = () => {};
  const choose = (entry) => {
    queue.cancel();
    unsubscribe();
    dialog.close();
    dialog.remove();
    onChoose(entry);
  };

  function showPicture(id) {
    const thumb = view?.thumbs[id];
    if (!thumb) return;
    const picture = pictures[id] ?? {};
    if (picture.front) {
      thumb.front.src = picture.front;
      thumb.front.hidden = false;
      thumb.box.classList.add('thumb--ready');
    }
    if (picture.inside) {
      thumb.inside.src = picture.inside;
      thumb.inside.hidden = false;
      thumb.box.classList.add('thumb--inside');
    }
    thumb.box.classList.toggle('thumb--drawn', Boolean(picture.failed) && !picture.front);
  }

  function requestPictures() {
    const ids = Object.keys(designs);
    const store = (id, kind) => (url) => {
      pictures[id] = { ...pictures[id], [kind]: url };
      showPicture(id);
    };
    const fail = (id) => () => {
      pictures[id] = { ...pictures[id], failed: true };
      showPicture(id);
    };
    ids.forEach((id) => queue.request(`${id}.front`, designs[id], { onReady: store(id, 'front'), onFail: fail(id) }));
    ids.forEach((id) => queue.request(`${id}.inside`, withoutDoors(designs[id]), { onReady: store(id, 'inside') }));
  }

  function languageSwitch(t) {
    const group = el('div', { className: 'lang-switch', attrs: { role: 'group', 'aria-label': t.start.languageLabel } });
    LANGUAGES.forEach((code) => {
      const option = el('button', {
        className: 'lang-switch__option',
        text: LANGUAGE_NAMES[code],
        attrs: { type: 'button', lang: code, 'aria-pressed': String(code === language.get()), title: code === 'he' ? 'עברית' : 'English' },
      });
      option.dataset.testid = `start-language-${code}`;
      option.addEventListener('click', () => language.set(code));
      group.append(option);
    });
    return group;
  }

  function aiCard(entry, s) {
    const card = el('button', { className: 'entry-card', attrs: { type: 'button' } }, [
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 22 })]),
      el('span', { className: 'entry-card__body' }, [
        el('span', { className: 'entry-card__title', text: s.entries[entry.id].title }),
        el('span', { className: 'entry-card__text', text: s.entries[entry.id].description }),
      ]),
      el('span', { className: 'entry-card__go' }, [icon('arrow', { size: 20 })]),
    ]);
    card.dataset.testid = `entry-${entry.id}`;
    card.addEventListener('click', () => choose(entry));
    return card;
  }

  function templateCard(id, index, s) {
    const design = designs[id];
    const ids = { name: `tpl-${id}-name`, story: `tpl-${id}-story`, features: `tpl-${id}-features`, img: `tpl-${id}-img` };
    const front = el('img', { className: 'thumb__front', attrs: { id: ids.img, alt: templateAlt(design, s), width: '400', height: '434', decoding: 'async' } });
    front.hidden = true;
    const inside = el('img', { className: 'thumb__inside', attrs: { alt: '', 'aria-hidden': 'true', width: '400', height: '434', decoding: 'async' } });
    inside.hidden = true;
    const box = el('span', { className: 'thumb' }, [
      elevationSvg(design),
      front,
      inside,
      el('span', { className: 'thumb__wait', text: s.rendering, attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'thumb__peek', text: s.insideView, attrs: { 'aria-hidden': 'true' } }),
    ]);
    const features = templateFeatures(design).map((key) => el('span', { className: 'chip' }, [icon(key, { size: 14 }), document.createTextNode(s.features[key])]));
    const card = el('button', {
      className: 'tpl',
      attrs: { type: 'button', 'aria-labelledby': ids.name, 'aria-describedby': `${ids.story} ${ids.features} ${ids.img}`, 'data-template': id },
    }, [
      box,
      el('span', { className: 'tpl__body' }, [
        el('span', { className: 'tpl__name', text: s.templates[id].name, attrs: { id: ids.name } }),
        el('span', { className: 'tpl__story', text: s.templates[id].story, attrs: { id: ids.story } }),
        el('span', { className: 'chips', attrs: { id: ids.features } }, [
          el('span', { className: 'chip chip--size', text: templateSize(design, s) }),
          ...features,
        ]),
      ]),
    ]);
    card.tabIndex = index === focused ? 0 : -1;
    card.dataset.testid = id === 'basic' ? 'entry-basic' : `template-${id}`; // entry-basic: the spec's basic entry point
    card.addEventListener('focus', () => { focused = index; });
    card.addEventListener('click', () => choose(templateEntry(id)));
    return { item: el('li', {}, [card]), card, thumb: { box, front, inside } };
  }

  function build() {
    const t = language.strings();
    const s = t.start;
    const ids = Object.keys(designs);
    const cards = ids.map((id, index) => templateCard(id, index, s));
    const gallery = el('ul', { className: 'gallery', attrs: { role: 'list', 'aria-labelledby': 'start-gallery-title' } }, cards.map((c) => c.item));
    rovingFocus(gallery, () => language.strings().dir === 'rtl');
    dialog.setAttribute('lang', language.get());
    dialog.setAttribute('dir', t.dir);
    dialog.replaceChildren(
      el('header', { className: 'start__bar' }, [createLogo({ size: 36 }), languageSwitch(t)]),
      el('main', { className: 'start__main' }, [
        el('h1', { className: 'start__title', text: s.title, attrs: { id: 'start-title' } }),
        el('p', { className: 'start__subtitle', text: s.subtitle }),
        el('div', { className: 'start__ai' }, AI_ENTRIES.map((entry) => aiCard(entry, s))),
        el('section', { className: 'start__templates', attrs: { 'aria-labelledby': 'start-gallery-title' } }, [
          el('div', { className: 'gallery-head' }, [
            el('h2', { className: 'gallery-head__title', text: s.galleryTitle, attrs: { id: 'start-gallery-title' } }),
            el('p', { className: 'gallery-head__hint', text: s.galleryHint(ids.length) }),
          ]),
          gallery,
        ]),
        el('p', { className: 'start__footnote', text: s.footnote }),
        el('a', { className: 'start__footnote', text: s.accessibility, attrs: { href: '/accessibility.html', hreflang: 'he' } }),
      ]),
    );
    view = { thumbs: Object.fromEntries(ids.map((id, i) => [id, cards[i].thumb])) };
    ids.forEach(showPicture);
  }

  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  unsubscribe = language.subscribe(() => {
    const switched = dialog.contains(document.activeElement) && document.activeElement.closest('.lang-switch');
    build();
    if (switched) dialog.querySelector(`[data-testid="start-language-${language.get()}"]`)?.focus();
  });
  build();
  document.body.append(dialog);
  dialog.showModal();
  requestPictures();
  return dialog;
}
