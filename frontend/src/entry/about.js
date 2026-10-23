// About Bob (בוב הבנאי): a fictional master carpenter, the character the chat agent plays (the agent prompt
// tells the same story and admits it is an AI when asked). The story and every figure here are invented for
// this study project, and the page says so. Shown under the start screen and from the top bar.
import { el } from '../editor/fields.js';
import { createBob } from './atelier/bob.js';
import { measure, whenVisible } from './atelier/measure.js';
import { countUp } from './atelier/motion.js';

export const ABOUT = Object.freeze({
  since: 1996, // the story is set in 2026: thirty years in the workshop
  eyebrow: 'אודות',
  title: ['שלושים שנה בסדנה.', 'עכשיו בכל בית.'],
  sign: 'בוב · מאסטר נגר',
  lead: 'נעים מאוד, אני בוב בנאי. וכן, זה באמת השם שמופיע לי בתעודת הזהות. בן 60, ירושלמי בדם, בנשמה, ובעיקר בידיים.',
  story: Object.freeze([
    'אחרי 30 שנה של תכנון הנדסי ובניית ארונות בהתאמה אישית, חשבתי ששמעתי כבר את כל הבדיחות על השם שלי. ואז הגיע יהונתן, הנכד בן ה-4. הוא מעריץ מושבע של סדרת הטלוויזיה, והוא משוכנע שזו סדרת תעודה על סבא שלו. ובכנות, כשאני מסתובב בבית עם חגורת הכלים, קשה להאשים אותו. מרוב התלהבות הוא קיצר תהליכים והדביק לי את הכינוי "בּוּבָּה".',
    'אז בעולם המקצועי אני בוב בנאי, אמן עץ קפדן שלא מתפשר על חלקיק מילימטר של פרזול. בשביל יהונתן אני פשוט "בובה" שיכול לתקן כל דבר.',
  ]),
  quote: '״אני לא מוכר ארונות. אני יוצר אומנות.״',
  text: 'בעיניי ארון הוא לא "פתרון אחסון". הוא יצירת אומנות פונקציונלית שחייבת להשתלב בהרמוניה עם החלל, עם האור ועם האופי הייחודי של הבית. אני לא מתפשר על מילימטר, על איכות הפרזול או על חומרי הגלם. רהיט טוב הוא כזה ששוכחים שהוא שם, עד שצריכים אותו.',
  stats: Object.freeze([
    Object.freeze({ value: 30, label: 'שנים בסדנה' }),
    Object.freeze({ value: 1284, label: 'ארונות בהתאמה' }),
    Object.freeze({ value: 20, label: 'כללי ייעוץ' }),
    Object.freeze({ value: 1, label: 'סבולת חיתוך, במ״מ' }),
  ]),
  privateTitle: 'פרויקטים פרטיים נבחרים',
  privateProjects: Object.freeze([
    Object.freeze({
      name: 'קיר הארונות של משפחת דהן',
      place: 'רחביה',
      text: 'בבניין לשימור ברחוב אלפסי תכננתי ובניתי קיר ארונות מאסיבי מעץ אלון מבוקע. האתגר היה להתאים את מבנה העץ לאבן הירושלמית החשופה בתוך הדירה, בלי לפגוע בקירות ההיסטוריים. התוצאה נראית כאילו הוצבה שם עוד בימי המנדט.',
    }),
    Object.freeze({
      name: 'מערכת האחסון של הזוג שפירא',
      place: 'עין כרם',
      text: 'בבית אבן צר ומקסים נדרשתי לתת מקסימום אחסון במינימום שטח. תכננתי מערכת ארונות חכמה שמשולבת בנישות הקיימות בקירות העבים, עם חזיתות תכלת פסטליות ומנגנוני טריקה שקטה מהמתקדמים בעולם.',
    }),
  ]),
  publicTitle: 'מעבר לבית הפרטי',
  publicIntro: 'נקראתי לדגל גם במבני ציבור, מוסדות דת והיכלי תרבות. אלה מקומות שבהם העץ פוגש אלפי אנשים ביום, סופג שחיקה מסיבית, ועדיין צריך להיות עוצר נשימה אחרי עשרים שנה.',
  publicProjects: Object.freeze([
    Object.freeze({
      name: 'בית הכנסת הגדול "עטרת שלום"',
      place: 'מקור ברוך',
      text: 'פרויקט של פעם בחיים. תכננתי ובניתי את ארון הקודש המרכזי והבמה מעץ מהגוני אפריקאי גושני, עם גילופים ידניים של שבעת המינים בחזית. גולת הכותרת הנדסית: בסיס הארון הוא חלל כפול שמכיל מערכת בקרת אקלים נסתרת. היא שומרת על טמפרטורה ולחות קבועות לספרי התורה העתיקים, בלי דציבל אחד של רעש בתפילת העמידה.',
    }),
    Object.freeze({
      name: '"המשכן לאמנויות הבמה – בית מזי"א החדש"',
      place: 'מרכז העיר',
      text: 'הייתי אחראי על חיפוי העץ האקוסטי באולם המופעים הקאמרי. בנינו פאנלים מרחפים מעץ אלון מולבן, בזוויות מתמטיות מדויקות שתוכננו יחד עם מהנדס קול, כדי לשבור גלים ולייצר סאונד נקי. דלפק הקבלה במבואה הוא קורת עץ גושנית באורך חמישה מטרים, בטיפול שרף אפוקסי ובגימור מט. הוא יוצר קונטרסט חם לבטון האדריכלי הקר שמסביב.',
    }),
    Object.freeze({
      name: 'ספריית המחקר והארכיון "גנזי ירושלים"',
      place: 'מגרש הרוסים',
      text: 'הספרייה ביקשה פתרון לאלפי כתבי יד נדירים, תוך ניצול מקסימלי של חלל כפול-גובה. הקמתי קומפלקס ספריות קיר בגובה שישה מטרים מעץ בוק אירופאי קשיח, עמיד לעומסים קיצוניים. הוא כולל סולמות ספרייה קלאסיים שנעים על מסילות פליז מושחר שיוצרו בהזמנה מיוחדת. הכול חובר בנגרות מסורתית של עץ בתוך עץ (Mortise and tenon), בלי בורג אחד גלוי.',
    }),
    Object.freeze({
      name: 'מוזיאון "פסיפס הזמן" למורשת',
      place: 'ליד שער יפו',
      text: 'בפרויקט שימור רגיש ייצרתי את כל ויטרינות התצוגה המרכזיות. האתגר היה לשלב מערכות תצוגה מודרניות, נקיות ואטומות לאבק, בתוך קמרונות אבן בני מאות שנים שאין בהם קיר ישר אחד. הבסיסים עשויים אגוז אמריקאי שעבר בסדנה שלי תהליך עישון ויישון ייחודי, עם צירים נסתרים לגמרי וזכוכית מוזיאונית נטולת השתקפות.',
    }),
  ]),
  closingTitle: 'כל לקוח הוא עולם ומלואו',
  closing: 'כשאתם בוחרים בי, אתם בוחרים ב-30 שנות ניסיון, בעין הנדסית שרואה את התמונה המלאה וביד בוטחת שמבטיחה גימור ללא דופי.',
  cta: 'מוכנים לתכנן את הארון הבא שלכם? דברו עם בובה (או פשוט, עם בוב).',
  disclosure: 'בוב הוא דמות בדיונית, והסיפור, הפרויקטים והנתונים בעמוד הזה בדיוניים. בשיחה עונה לכם עוזר AI בדמותו.',
});

const formatNumber = (n) => n.toLocaleString('en-US');

const projectCards = (projects) => el('div', { className: 'about__projects' }, projects.map((p) => el('article', { className: 'about__project' }, [
  el('h4', { className: 'about__project-name' }, [p.name, el('span', { className: 'about__project-place', text: p.place })]),
  el('p', { className: 'about__project-text', text: p.text }),
])));

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
      ...ABOUT.story.map((text) => el('p', { className: 'about__text', text })),
      el('blockquote', { className: 'about__quote' }, [el('p', { text: ABOUT.quote })]),
      el('p', { className: 'about__text', text: ABOUT.text }),
      el('dl', { className: 'about__stats' }, stats.map((s) => s.node)),
      el('h3', { className: 'about__heading', text: ABOUT.privateTitle }),
      projectCards(ABOUT.privateProjects),
      el('h3', { className: 'about__heading', text: ABOUT.publicTitle }),
      el('p', { className: 'about__text', text: ABOUT.publicIntro }),
      projectCards(ABOUT.publicProjects),
      el('h3', { className: 'about__heading', text: ABOUT.closingTitle }),
      el('p', { className: 'about__text', text: ABOUT.closing }),
      el('p', { className: 'about__cta', text: ABOUT.cta }),
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
