// About Bob (בוב הבנאי): a fictional master carpenter, the character the chat agent plays (the agent prompt
// tells the same story and admits it is an AI when asked). The story and every figure here are invented for
// this study project, and the page says so. Shown under the start screen and from the top bar.
import { el } from '../editor/fields.js';
import { createBob } from './atelier/bob.js';
import { measure, whenVisible } from './atelier/measure.js';
import { countUp } from './atelier/motion.js';

export const ABOUT = Object.freeze({
  since: 1995, // the story is set in 2026: thirty-one years in the workshop
  eyebrow: 'אודות',
  title: ['שלושים ואחת שנה בסדנה.', 'עכשיו בכל בית.'],
  sign: 'בוב · מאסטר נגר',
  lead: 'בוב נכנס לסדנה של סבא שלו בשנת 1995, עם מסור יד ועיפרון מאחורי האוזן. מאז הוא תכנן ובנה יותר מאלף ארונות בהתאמה: נישות עקומות בבתים ישנים, חדרי ילדים צרים, וחדרי ארונות שלמים שאף מידה בהם לא הייתה ישרה.',
  quote: '״אני לא מוכר ארונות. אני דואג שאף אחד לא יטעה במידה.״',
  text: 'בנאי נולד כשבוב ישב עם צוות קטן ולימד אותו את מה שלקח לו שלושים שנה ללמוד: עשרים כללי ייעוץ מבוססי מחקר, שיטת בנייה אחת מוצהרת, ותיק נגר שאף נגר לא צריך לנחש ממנו.',
  stats: Object.freeze([
    Object.freeze({ value: 31, label: 'שנים בסדנה' }),
    Object.freeze({ value: 1284, label: 'ארונות בהתאמה' }),
    Object.freeze({ value: 20, label: 'כללי ייעוץ' }),
    Object.freeze({ value: 1, label: 'סבולת חיתוך, במ״מ' }),
  ]),
  disclosure: 'בוב הוא דמות בדיונית, והסיפור והנתונים בעמוד הזה בדיוניים. בשיחה עונה לכם עוזר AI בדמותו.',
});

const formatNumber = (n) => n.toLocaleString('en-US');

/**
 * The About section. Returns { element, dispose() }. The figures count up under a pencil dimension line the
 * first time they are seen; with reduced motion they are simply shown.
 */
export function buildAbout({ reducedMotion = false, headingId = 'about-title' } = {}) {
  const portrait = el('div', { className: 'about__bob' });
  const stats = ABOUT.stats.map((stat) => {
    const number = el('span', { text: formatNumber(stat.value) });
    const value = el('span', { className: 'stat__value' }, [number]);
    return { stat, number, value, node: el('div', { className: 'stat' }, [el('dt', { text: stat.label }), el('dd', {}, [value])]) };
  });
  const title = el('h2', { className: 'about__title', attrs: { id: headingId } });
  title.append(ABOUT.title[0], el('br'), ABOUT.title[1]);
  const element = el('section', { className: 'about', attrs: { 'aria-labelledby': headingId } }, [
    el('div', { className: 'about__portrait' }, [portrait, el('p', { className: 'about__sign', text: ABOUT.sign })]),
    el('div', { className: 'about__story' }, [
      el('p', { className: 'atl-eyebrow', text: ABOUT.eyebrow }),
      title,
      el('p', { className: 'about__lead', text: ABOUT.lead }),
      el('blockquote', { className: 'about__quote' }, [el('p', { text: ABOUT.quote })]),
      el('p', { className: 'about__text', text: ABOUT.text }),
      el('dl', { className: 'about__stats' }, stats.map((s) => s.node)),
      el('p', { className: 'about__disclosure', text: ABOUT.disclosure }),
    ]),
  ]);
  element.dataset.testid = 'about';

  const bob = createBob(portrait, { size: 200, reducedMotion });
  const cleanups = [() => bob.dispose()];
  stats.forEach(({ stat, number, value }, i) => {
    const line = measure(value, { label: '', delay: 150 + i * 120, reducedMotion });
    cleanups.push(() => line.dispose());
    if (reducedMotion) return;
    number.textContent = '0';
    let raf = 0;
    const stop = whenVisible(value, () => {
      const begin = performance.now() + 150 + i * 120;
      const step = (now) => {
        const p = (now - begin) / 1300;
        number.textContent = formatNumber(countUp(stat.value, p));
        raf = p < 1 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    });
    cleanups.push(() => {
      stop();
      cancelAnimationFrame(raf);
      number.textContent = formatNumber(stat.value);
    });
  });
  return {
    element,
    bob,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}

/** The About page as a dialog, from the top bar. Esc or the close button closes it. */
export function openAboutDialog({ reducedMotion = false } = {}) {
  const about = buildAbout({ reducedMotion, headingId: 'about-dialog-title' });
  const close = el('button', { className: 'btn btn--sm about-dialog__close', text: 'סגירה', attrs: { type: 'button' } });
  close.dataset.testid = 'about-close';
  const dialog = el('dialog', { className: 'about-dialog', attrs: { 'aria-labelledby': 'about-dialog-title' } }, [
    el('div', { className: 'about-dialog__bar' }, [close]),
    about.element,
  ]);
  dialog.dataset.testid = 'about-dialog';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    about.dispose();
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  return dialog;
}
