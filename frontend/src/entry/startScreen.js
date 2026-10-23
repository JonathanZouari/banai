// Start screen, "a carpenter's studio drawn in pencil" (P3, approved 2026-10-17). A full-screen modal: a
// wardrobe assembles from a pencil sketch, its dimensions draw themselves, Bob says hello, and the three ways
// in (spec section 6) float over it as glass cards. Below it, the About page. Choosing a card closes it and
// frees the 3D (one WebGL context stays: the editor's). A choice is required: Esc does not dismiss it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { ENTRY_POINTS } from './entryPoints.js';
import { buildAbout } from './about.js';
import { createBob, fakeVoice } from './atelier/bob.js';
import { createHero } from './atelier/hero.js';
import { measure } from './atelier/measure.js';
import { CHAT_LANGUAGES, LANGUAGE_NAMES, getChatLanguage, onChatLanguage, setChatLanguage } from '../chat/chatI18n.js';

export const START_FOOTNOTE = 'התכנון הוא טיוטה לשיחה עם נגר. הנגר מאמת את המידות באתר לפני הייצור.';
export const BOB_GREETING = 'היי, אני בוב. ספרו לי מה צריך להיכנס לארון, ואני אשרטט.';

/** The brand: the mark (cloned from the page, a static constant), the name and the studio line. */
function brand() {
  const mark = document.querySelector('.topbar .brand__mark')?.cloneNode(true);
  return el('div', { className: 'atl-brand' }, [
    ...(mark ? [mark] : []),
    el('span', { className: 'atl-brand__name', text: 'בנאי' }),
    el('span', { className: 'atl-brand__tag', text: 'סטודיו לארונות בהתאמה' }),
  ]);
}

/** The conversation's language (ADR-029), chosen before the first word; the chat header can change it later. */
function languageChoice(cleanups) {
  const buttons = CHAT_LANGUAGES.map((lang) => {
    const button = el('button', { className: 'segmented__option', text: LANGUAGE_NAMES[lang], attrs: { type: 'button', lang } });
    button.dataset.testid = `start-language-${lang}`;
    button.addEventListener('click', () => setChatLanguage(lang));
    return button;
  });
  const sync = (current) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(CHAT_LANGUAGES[i] === current)));
  sync(getChatLanguage());
  const off = onChatLanguage(sync);
  if (typeof off === 'function') cleanups.push(off);
  return el('div', { className: 'start__language' }, [
    el('span', { className: 'start__language-label', text: 'שפת השיחה עם בוב:' }),
    el('div', { className: 'segmented segmented--sm', attrs: { role: 'group', 'aria-label': 'שפת השיחה' } }, buttons),
  ]);
}

function entryCard(entry, choose) {
  const card = el('button', { className: 'atl-entry', attrs: { type: 'button' } }, [
    el('span', { className: 'atl-entry__icon', attrs: { 'aria-hidden': 'true' } }, [icon(entry.icon, { size: 22 })]),
    el('span', { className: 'atl-entry__title', text: entry.title }),
    el('span', { className: 'atl-entry__text', text: entry.description }),
    el('span', { className: 'atl-entry__go' }, [document.createTextNode(`${entry.action} `), icon('arrow', { size: 16 })]),
  ]);
  card.dataset.testid = `entry-${entry.id}`;
  card.addEventListener('click', () => choose(entry));
  return card;
}

/**
 * Mounts the start screen. `reducedMotion`: no assembly, no count-ups. `still`: a software renderer, so the
 * wardrobe is drawn once instead of animated (the CPU stays free for the editor).
 */
export function mountStartScreen({ onChoose, reducedMotion = false, still = false }) {
  const cleanups = [];
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const canvas = el('canvas', { className: 'atl-hero__canvas', attrs: { 'aria-hidden': 'true' } });
  const dims = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dims.setAttribute('class', 'atl-hero__dims');
  dims.setAttribute('aria-hidden', 'true');

  // The title takes the first focus (not the language buttons): a screen reader starts at the heading.
  const title = el('h1', { className: 'atl-hero__title', attrs: { id: 'start-title', tabindex: '-1', autofocus: '' } });
  const measured = el('span', { className: 'atl-hero__measured', text: 'בדיוק במידה.' });
  title.append('מתכננים ארון.', el('br'), measured);
  const avatar = el('div', { className: 'atl-bob-line__avatar' });
  const lineText = el('span', { attrs: { 'data-testid': 'bob-greeting' } });
  const bobLine = el('div', { className: 'atl-bob-line', attrs: { 'aria-live': 'polite' } }, [
    avatar,
    el('p', { className: 'atl-bob-line__bubble' }, [el('b', { text: 'בוב הבנאי' }), lineText]),
  ]);

  let dialog;
  const choose = (entry) => {
    if (!dialog.open) return;
    dialog.close();
    onChoose(entry);
  };
  const about = buildAbout({ reducedMotion });
  const toAbout = el('button', { className: 'atl-link', text: 'הכירו את בוב', attrs: { type: 'button' } });
  toAbout.dataset.testid = 'start-about';
  toAbout.addEventListener('click', () => about.element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }));
  const replay = el('button', { className: 'atl-replay', text: 'הרכבה מחדש', attrs: { type: 'button' } });

  const hero = el('section', { className: 'atl-hero', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('div', { className: 'atl-hero__paper', attrs: { 'aria-hidden': 'true' } }),
    canvas,
    dims,
    el('header', { className: 'atl-hero__bar' }, [brand(), languageChoice(cleanups)]),
    el('div', { className: 'atl-hero__copy' }, [
      el('p', { className: 'atl-eyebrow', text: 'ארון בגדים, מהרעיון ועד תיק הנגר' }),
      title,
      el('p', { className: 'atl-hero__lead', text: 'מספרים לבוב מה צריך להיכנס, מעצבים בתלת-ממד, ומקבלים תיק ייצור מלא לנגר: שרטוטים, רשימת חיתוך ושיבוץ לוחות.' }),
      bobLine,
    ]),
    el('div', { className: 'atl-hero__cards' }, ENTRY_POINTS.map((entry) => entryCard(entry, choose))),
    el('div', { className: 'atl-hero__foot' }, [el('p', { className: 'start__footnote', text: START_FOOTNOTE }), toAbout,
      el('a', { className: 'start__footnote', text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', 'data-testid': 'start-a11y' } })]),
    replay,
  ]);

  dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [hero, about.element]);
  dialog.dataset.testid = 'start-screen';
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.documentElement.classList.add('is-start-open');
  cleanups.push(() => document.documentElement.classList.remove('is-start-open'));
  document.body.append(dialog);
  dialog.showModal();

  // The wardrobe. Without WebGL the start screen still works: paper, copy and cards.
  let scene = null;
  try {
    scene = createHero(canvas, dims, { reducedMotion, still });
  } catch {
    canvas.hidden = true;
    dims.hidden = true;
    replay.hidden = true;
  }
  if (scene) cleanups.push(() => scene.dispose());

  const heading = measure(measured, { label: 'עד המילימטר', delay: reducedMotion || still ? 0 : 900, reducedMotion });
  cleanups.push(() => heading.dispose());

  const bob = createBob(avatar, { size: 58, reducedMotion });
  cleanups.push(() => bob.dispose());
  let stopVoice = () => {};
  const greet = () => {
    timers.splice(0).forEach(clearTimeout);
    stopVoice();
    bobLine.classList.remove('is-on');
    lineText.textContent = '';
    const at = reducedMotion ? 0 : ((scene?.assembledAt ?? 0) + 1.2) * 1000;
    later(() => {
      bobLine.classList.add('is-on');
      if (reducedMotion) {
        lineText.textContent = BOB_GREETING;
        return;
      }
      // The words appear at speaking pace while the mouth moves (text, no audio).
      bob.setState('speaking');
      stopVoice = fakeVoice((level) => bob.setLevel(level), { seconds: 3.4 });
      const words = BOB_GREETING.split(' ');
      words.forEach((_, i) => later(() => { lineText.textContent = words.slice(0, i + 1).join(' '); }, i * 300));
      later(() => bob.setState('happy'), 3500);
      later(() => bob.setState('idle'), 4600);
    }, at);
  };
  greet();
  cleanups.push(() => {
    timers.splice(0).forEach(clearTimeout);
    stopVoice();
  });
  replay.addEventListener('click', () => {
    scene?.replay();
    greet();
  });
  cleanups.push(() => about.dispose());

  dialog.addEventListener('close', () => {
    cleanups.splice(0).forEach((fn) => fn());
    dialog.remove();
  });
  return dialog;
}
