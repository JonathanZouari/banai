// Prototype design agent: a rule-based stand-in for the production agent (OpenAI behind the
// FastAPI backend), with the same contract. It talks like a person: free conversation, no
// suggestion buttons or multiple-choice questions. It stays on the wardrobe (plus one
// deliberate control: weather in Jerusalem), reads the current design, explains its reasoning,
// and never edits directly: changes come back as a proposal the user confirms.
import { PRESETS, INSERTS, DECORS, insertBlocked, layout, cm, decorById, PULLDOWN_WIDTH } from './model.js';
import { diff } from './diff.js';

const HEB = '\\u0590-\\u05FF';
const word = (w) => `(?<![${HEB}])${w}(?![${HEB}])`;
// Whole Hebrew words: "רוחב" (width) contains "רוח" (wind). "לחות" stays out: a damp wall is a wardrobe topic.
const WEATHER = new RegExp(`מזג[ -]?ה?אוויר|תחזית|גשם|טמפרטור|${word('רוח')}|${word('שמשי')}|חם היום|קר היום|מעלות בחוץ`);
const OFF_TOPIC = /חדשות|פוליטיק|בחירות|ספורט|כדורגל|מניות|בורסה|ביטקוין|מתכון|בישול|שיר|בדיחה|תכנות|קוד|פייתון|מתמטיק|שיעורי בית|רפוא|תרופ|טיסה|סרט/;
const WARDROBE = /ארון|תא|מדף|מגיר|דלת|ציר|הזזה|מראה|ידית|רוחב|גובה|עומק|ס["״]?מ|מטר|נעל|מכנס|תלי|מוט|תאור|אלון|אגוז|לבן|אפור|גרפיט|קשמיר|צבע|חומר|דקור|נישה|תקרה|בגד|חולצ|שמל|מעיל|סדר|עיצוב|נגר|תיק|אזהר|בעי|חיתוך|פנים|גוף|חזית|נשלף|הוסף|הורד|הסר|תגדיל|תקטין|תוסיף|מה יש|תאר|אחסון|לחות|קיר|זוגות|ערימ|מקופל/;
const NUM_WORDS = { אחד: 1, אחת: 1, שניים: 2, שתיים: 2, שני: 2, שתי: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, מאה: 100 };

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => structuredClone(x);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const numberWords = (t) => t.replace(new RegExp(`(?<![${HEB}])(${Object.keys(NUM_WORDS).join('|')})(?![${HEB}])`, 'g'), (w) => String(NUM_WORDS[w]));

/** Length in mm from Hebrew text: "200 ס״מ", "2 מטר", "2.4", "1800 מ״מ". Bare numbers ≤ 10 are metres, else cm. */
export function parseLength(text) {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(מטר|מ׳|מ'|ס["״׳']?מ|סנטימטר|cm|מ["״]מ|mm)?/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  const unit = m[2] ?? '';
  if (/מטר|מ׳|מ'/.test(unit)) return Math.round(v * 1000);
  if (/מ["״]מ|mm/.test(unit)) return Math.round(v);
  if (/ס|cm/.test(unit)) return Math.round(v * 10);
  return v <= 10 ? Math.round(v * 1000) : Math.round(v * 10);
}

function compRef(text, n) {
  const m = text.match(/תא\s*(?:מספר\s*)?(\d+)/);
  if (m) return Math.min(n, Math.max(1, Number(m[1]))) - 1;
  if (/שמאל/.test(text)) return 0;
  if (/ימנ|ימין/.test(text)) return n - 1;
  if (/אמצע|מרכז/.test(text)) return Math.floor((n - 1) / 2);
  return null;
}

// ---------- inventory from free text ----------
const CATS = {
  long: /מעיל|שמל|חליפ|גלימ|ארוכ/,
  short: /חולצ|ז׳קט|ז'קט|ג׳קט|ג'קט|חצאי|מכנס|בלייזר|קצר/,
  shoes: /נעל|זוג|סניקרס|מגפ|סנדל/,
  folded: /מקופל|ערימ|סוודר|טישרט|טי-שירט|מגב|קפוצ|פיג׳מ|מצעים/,
};
const ASK = {
  long: 'כמה פריטים ארוכים יש לכם לתלייה, כמו מעילים ושמלות',
  short: 'כמה דברים קצרים לתלייה, כמו חולצות וז׳קטים',
  shoes: 'כמה זוגות נעליים',
  folded: 'בערך כמה ערימות של בגדים מקופלים',
};
export function extractInventory(text) {
  const t = numberWords(text);
  const found = {};
  const cat = (w) => Object.keys(CATS).find((k) => CATS[k].test(w));
  for (const m of t.matchAll(new RegExp(`(\\d+)\\s*((?:[${HEB}"׳״'\\-]+\\s*){1,3})`, 'g'))) {
    const k = cat(m[2]);
    if (k && found[k] == null) found[k] = Number(m[1]);
  }
  for (const m of t.matchAll(new RegExp(`([${HEB}"׳״']+)\\s*[:\\-–]?\\s*(\\d+)`, 'g'))) {
    const k = cat(m[1]);
    if (k && found[k] == null) found[k] = Number(m[2]);
  }
  for (const m of t.matchAll(new RegExp(`(?:אין|בלי|ללא|לא צריך)\\s+(?:לי\\s+|לנו\\s+|מקום ל)?([${HEB}]+)`, 'g'))) {
    const k = cat(m[1]);
    if (k && found[k] == null) found[k] = 0;
  }
  return found;
}
// Hebrew counts read better in words: "שני תאים", not "2 תאים".
const cells = (n) => ({ 1: 'תא אחד', 2: 'שני תאים', 3: 'שלושה תאים', 4: 'ארבעה תאים', 5: 'חמישה תאים', 6: 'שישה תאים' })[n] ?? `${n} תאים`;
const joinHe = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ו${parts.at(-1)}`);

export function createAgent() {
  let memory = null; // multi-turn: the inventory conversation

  const proposal = (state, title, mutate) => {
    const after = clone(state);
    mutate(after);
    const changes = diff(state, after);
    return changes.length ? { title, changes, apply: mutate, after, L: layout(after) } : null;
  };

  function describe(state, L, adv) {
    const presets = L.comps.map((c) => PRESETS.find((p) => p.id === c.preset).name);
    const doors = { hinged: 'דלתות ציר', sliding: 'דלתות הזזה', none: 'בלי דלתות' }[state.doors.type];
    const warns = adv.filter((a) => a.level !== 'info');
    return `כרגע יש לכם ארון ברוחב ${cm(L.W)}, גובה ${cm(L.H)} ועומק ${cm(L.D)} ס״מ, עם ${L.n} תאים: ${joinHe(presets)}. החזיתות ב${decorById(state.decor.front).name}, עם ${doors}. ${warns.length ? `יש ${warns.length === 1 ? 'דבר אחד ששווה לבדוק' : `${warns.length} דברים ששווה לבדוק`}: ${joinHe(warns.map((a) => a.title))}. רוצים שנעבור על זה?` : 'כרגע אין שום אזהרה פתוחה.'}`;
  }

  function inventoryPlan(state, L, a) {
    const n0 = L.n;
    const wcm = (L.interiorW - (n0 - 1) * 17) / n0 / 10;
    // Rules of thumb (estimates): rail width per garment, piles per shelf, pairs per shoe tier.
    const longCm = a.long * 6;
    const shortCm = a.short * 3.5;
    const needLong = a.long ? Math.ceil(longCm / wcm) : 0;
    const needShort = a.short ? Math.ceil(shortCm / (2 * wcm)) : 0;
    const pileCap = Math.max(1, Math.floor(wcm / 30)) * 5;
    const needFold = a.folded ? Math.ceil(a.folded / pileCap) : 0;
    const shoeCap = 3 * Math.max(1, Math.floor(wcm / 22));
    const needShoes = a.shoes ? Math.ceil(a.shoes / shoeCap) : 0;
    const plan = [];
    for (let i = 0; i < needLong; i++) plan.push({ preset: 'long', inserts: [] });
    for (let i = 0; i < needShort; i++) plan.push({ preset: 'double', inserts: [] });
    for (let i = 0; i < needFold; i++) plan.push({ preset: 'shelves', inserts: [] });
    // Shoes get their own shelf compartments; add one if needed rather than shortening the hanging.
    const extra = Math.max(0, needShoes - plan.filter((p) => p.preset === 'shelves').length);
    let n = Math.max(n0, Math.min(6, plan.length + extra));
    while (n > n0 && (L.W - 34 - (n - 1) * 17) / n < 450) n--;
    for (let i = 0; plan.length < n; i++) plan.push({ preset: i < extra ? 'shelves' : plan.some((p) => p.preset === 'drawers') ? 'shelves' : 'drawers', inserts: [] });
    let shoesLeft = needShoes;
    let underLong = 0;
    for (const want of ['shelves', 'drawers', 'long']) {
      for (const p of plan.slice(0, n)) {
        if (!shoesLeft || p.preset !== want || p.inserts.includes('shoes')) continue;
        if (want === 'drawers') p.preset = 'shelves';
        if (want === 'long') underLong++;
        p.inserts.push('shoes');
        shoesLeft--;
      }
    }
    const fitted = plan.slice(0, n).map((p) => ({ ...p, split: false }));
    const tooMuch = plan.length > n;
    const prop = proposal(state, 'סידור לפי מה שיש לכם בארון', (s) => { s.compartments = clone(fitted); });
    const reasons = [
      a.long ? `ל-${a.long} הפריטים הארוכים צריך בערך ${Math.round(longCm)} ס״מ של מוט, כלומר ${needLong === 1 ? 'תא תלייה ארוכה אחד' : `${cells(needLong)} של תלייה ארוכה`}` : null,
      a.short ? `${a.short} הדברים הקצרים תופסים בערך ${Math.round(shortCm)} ס״מ, אז שמתי אותם על שני מוטות בתלייה כפולה` : null,
      a.shoes ? `${a.shoes} זוגות נעליים נכנסים ב${cells(needShoes)} עם מדפים משופעים${underLong ? `. ${underLong === 1 ? 'אחד מהם' : `${underLong} מהם`} יושב מתחת לתלייה הארוכה, כי אין מקום לתא נוסף, וזה מקצר אותה. אם זה מפריע, אפשר לוותר על חלק מהמדפים` : ', בתאי מדפים, כדי לא לקצר את התלייה'}` : null,
      a.folded ? `לבגדים המקופלים מספיק ${needFold === 1 ? 'תא מדפים אחד' : `${cells(needFold)} של מדפים`}` : null,
    ].filter(Boolean);
    const text = `${pick(['תודה, זה מספיק לי.', 'מעולה, יש לי תמונה טובה.', 'סבבה, הבנתי.'])} ${reasons.join('. ')}.${n > n0 ? ` בשביל זה הארון צריך ${cells(n)} במקום ${n0}, וכל תא יוצא בערך ${Math.round((L.W - 34 - (n - 1) * 17) / n / 10)} ס״מ.` : ''}${tooMuch ? ' בכנות, הכול לא נכנס ברוחב הזה. נתתי עדיפות לתלייה, ושווה לחשוב על ארון רחב יותר.' : ''} אלה הערכות לפי כללי אצבע, לא ספירה מדויקת. הכנתי הצעה, תסתכלו ותגידו מה דעתכם.`;
    return { text, proposal: prop };
  }

  function afterText(p, extra = '') {
    return `${extra}${extra ? ' ' : ''}${pick(['הכנתי הצעה, תאשרו אם זה נראה לכם.', 'ההצעה למטה. שום דבר לא משתנה עד שתאשרו.', 'אם זה מתאים, אשרו בכרטיס.'])}`;
  }

  const offer = (p, why = '') => (p
    ? { text: afterText(p, why), proposal: p }
    : { text: pick(['זה כבר המצב בתכנון שלכם.', 'זה בדיוק מה שיש כרגע.']) });

  async function reply(text, { state, adv }) {
    const raw = text.trim();
    const t = numberWords(raw);
    const L = layout(state);
    await delay(500 + Math.min(900, raw.length * 14));

    // Small talk that belongs to any conversation.
    if (/^(היי|שלום|הי|בוקר טוב|ערב טוב|מה נשמע)[!.\s]*$/.test(raw)) return { text: pick([`היי! אני כאן. הארון כרגע ${cm(L.W)} ס״מ עם ${L.n} תאים. על מה נעבוד?`, 'שלום! במה בארון אפשר לעזור?']) };
    if (/^(תודה|תודה רבה|מעולה|סבבה|אחלה|יופי)[!.\s]*$/.test(raw)) return { text: pick(['בשמחה!', 'בכיף. משהו נוסף בארון?', 'שמח לעזור.']) };
    if (/^(כן|בטח|אוקיי|אוקי|יאללה)[!.\s]*$/.test(raw)) return { text: 'אז רק לאשר בכרטיס ההצעה, ואני מעדכן את התכנון.' };

    // The inventory conversation: understand free text, ask only for what's missing.
    if (memory?.mode === 'inventory') {
      const got = extractInventory(t);
      const done = /זהו|זה הכל|זה הכול|אין עוד|זה מה שיש/.test(raw);
      if (!Object.keys(got).length && !done) {
        memory = null; // the user moved on: handle the message normally
      } else {
        Object.assign(memory.answers, got);
        memory.rounds++;
        const missing = Object.keys(ASK).filter((k) => memory.answers[k] == null);
        if (missing.length && !done && memory.rounds < 3) {
          return { text: `${pick(['רשמתי.', 'מצוין.', 'הבנתי.'])} ${missing.length === 1 ? `ו${ASK[missing[0]]}?` : `עוד שאלה קטנה: ${joinHe(missing.map((k) => ASK[k]))}?`}` };
        }
        const answers = { long: 0, short: 0, shoes: 0, folded: 0, ...memory.answers };
        memory = null;
        return inventoryPlan(state, L, answers);
      }
    }

    // Topic guard, with weather in Jerusalem as the one deliberate exception.
    if (WEATHER.test(t)) {
      if (/ירושלים/.test(t)) return { text: 'בירושלים עכשיו בסביבות 21 מעלות ושמשי (באב-הטיפוס זה נתון מדומה, ובייצור הוא מגיע מ-Open-Meteo). חוץ מזה אני מדבר רק על הארון.' };
      return { text: 'את מזג האוויר אני בודק רק בירושלים. אבל אם הארון יושב על קיר חיצוני, כדאי לחשוב על לחות ואוורור, ועל זה בשמחה אדבר.' };
    }
    if (OFF_TOPIC.test(t) || !WARDROBE.test(t)) {
      return { text: pick([
        'זה כבר מחוץ לתחום שלי. אני כאן רק בשביל התכנון של הארון: מידות, חלוקה, חומרים ורכיבים. מה בארון מעסיק אתכם?',
        'על זה אני לא יכול לעזור, אני מתמקד רק בארון שלכם. יש משהו בתכנון שתרצו לשנות?',
      ]) };
    }

    const inv = extractInventory(t);
    if (Object.keys(inv).length >= 2) {
      memory = { mode: 'inventory', answers: inv, rounds: 1 };
      const missing = Object.keys(ASK).filter((k) => inv[k] == null);
      if (missing.length) return { text: `${pick(['רשמתי.', 'מצוין, זה עוזר.'])} ${missing.length === 1 ? `ו${ASK[missing[0]]}?` : `ו${joinHe(missing.map((k) => ASK[k]))}?`}` };
      memory = null;
      return inventoryPlan(state, L, { long: 0, short: 0, shoes: 0, folded: 0, ...inv });
    }
    if (/לסדר|סידור|מלאי|יש לי|מה כדאי|תכנן|תעזור|מה נכנס|כמה בגדים/.test(raw)) {
      memory = { mode: 'inventory', answers: {}, rounds: 0 };
      return { text: 'בכיף. ספרו לי מה צריך להיכנס לארון: כמה פריטים ארוכים לתלייה כמו מעילים ושמלות, כמה חולצות וז׳קטים, כמה זוגות נעליים, ובערך כמה ערימות של בגדים מקופלים. לא צריך מדויק, הערכה מספיקה.' };
    }

    if (/מה יש|תאר|מה המצב|סיכום|איך זה נראה/.test(raw)) return { text: describe(state, L, adv) };
    if (/אזהר|בעי|לבדוק|תקין|בעייתי/.test(raw)) {
      const warns = adv.filter((a) => a.level !== 'info');
      if (!warns.length) return { text: 'האמת, כרגע הכול נראה טוב. מה שמופיע בפאנל הייעוץ הן הערות מידע בלבד, לא בעיות.' };
      const first = warns[0];
      const fixable = warns.find((a) => a.fix);
      const intro = warns.length === 1 ? `יש דבר אחד: ${first.title}. ${first.body}` : `יש ${warns.length} דברים. הכי חשוב: ${first.title}. ${first.body}`;
      if (fixable) {
        const p = proposal(state, fixable.fix.label, fixable.fix.apply);
        const how = fixable === first ? `ההצעה שלי: ${fixable.fix.label}.` : `לגבי "${fixable.title}" יש לי תיקון פשוט: ${fixable.fix.label}.`;
        return { text: `${intro} ${how}`, proposal: p };
      }
      return { text: `${intro} לזה אין לי תיקון אוטומטי, ושווה לעבור על זה עם הנגר.` };
    }

    const n = L.n;
    const idx = compRef(t, n);
    const len = parseLength(t);

    // Dimensions, with the consequence spelled out.
    for (const [re, key, label] of [[/רוחב|רחב|צר/, 'width', 'רוחב'], [/גובה|גבוה|נמוך/, 'height', 'גובה'], [/עומק|עמוק/, 'depth', 'עומק']]) {
      if (!re.test(t) || !len) continue;
      const p = proposal(state, `${label} ${cm(len)} ס״מ`, (s) => { s.body[key] = len; });
      if (!p) return { text: `ה${label} כבר ${cm(len)} ס״מ.` };
      let why = '';
      if (key === 'width') why = `ככה כל תא יוצא בערך ${cm(p.L.comps[0].w)} ס״מ${state.doors.type === 'hinged' && p.L.doors.some((d) => d.w > 600) ? ', והדלתות יוצאות רחבות מ-60 ס״מ. אולי נפצל אותן בהמשך' : ''}.`;
      if (key === 'height') why = Math.hypot(len, L.D) + 10 > state.site.ceiling ? `שימו לב: בגובה הזה הגוף כבר לא יתרומם מתחת לתקרה של ${cm(state.site.ceiling)} ס״מ.` : `זה עדיין עובר את אלכסון ההרמה מול התקרה.`;
      if (key === 'depth') why = len < 580 ? 'בעומק כזה קולבים כבר לא נכנסים בנוחות, כי תלייה צריכה בערך 58 ס״מ.' : '';
      return offer(p, why);
    }
    // Doors and fronts.
    if (/הזזה/.test(t)) {
      const p = proposal(state, 'דלתות הזזה', (s) => { s.doors.type = 'sliding'; });
      return offer(p, `הזזה חוסכת מקום מול הארון. מצד שני, המסילות לוקחות 8–10 ס״מ מהעומק${L.D < 690 ? `, ובעומק ${cm(L.D)} התלייה תצא צפופה` : ''}.`);
    }
    if (/ציר/.test(t) && /דלת/.test(t)) return offer(proposal(state, 'דלתות ציר', (s) => { s.doors.type = 'hinged'; }), 'דלתות ציר נותנות גישה מלאה לכל התא, אבל צריך מקום לפתיחה מול הארון.');
    if (/בלי דלתות|ארון פתוח/.test(t)) return offer(proposal(state, 'ארון פתוח', (s) => { s.doors.type = 'none'; }), 'ארון פתוח נראה קליל, אבל הכול חשוף לאבק.');
    if (/מראה/.test(t)) {
      const off = /בלי|הסר|תוריד/.test(t);
      return offer(proposal(state, off ? 'הסרת מראה' : 'מראה בדלת המרכזית', (s) => { s.doors.mirror = !off; }), off ? '' : 'מראה מוסיפה בערך 10 ק״ג למ״ר, אז נבדוק שהצירים עומדים בזה.');
    }
    // Decors.
    const decor = /אגוז/.test(t) ? 'walnut' : /אלון בהיר/.test(t) ? 'light_oak' : /אלון/.test(t) ? 'oak' : /לבן/.test(t) ? 'snow' : /קשמיר|בז/.test(t) ? 'cashmere' : /אפור/.test(t) ? 'stone' : /גרפיט|שחור|אנתרציט/.test(t) ? 'graphite' : null;
    if (decor && !/נעל|מכנס|מדפ|מגיר/.test(t)) {
      const slot = /גוף|פנים|מבפנים/.test(t) ? 'body' : 'front';
      const d = DECORS.find((x) => x.id === decor);
      return offer(proposal(state, `${slot === 'front' ? 'חזיתות' : 'גוף'}: ${d.name}`, (s) => { s.decor[slot] = decor; }), `${d.name} (${d.code}) ${slot === 'front' ? 'לחזיתות' : 'לגוף'}${d.map ? ', עם טקסטורת עץ אמיתית בקנה מידה' : ''}.`);
    }
    // Inserts, placed where they make sense, and saying why.
    const ins = /נעל/.test(t) ? 'shoes' : /מכנס/.test(t) ? 'trousers' : /נשלף|פנטוגרף/.test(t) ? 'pulldown' : /לד|תאור/.test(t) ? 'led' : null;
    if (ins) {
      const def = INSERTS.find((d) => d.id === ins);
      if (ins === 'led' && idx == null) {
        const p = proposal(state, 'תאורת LED בכל התאים', (s) => { s.compartments.forEach((c) => { c.inserts = [...new Set([...(c.inserts ?? []), 'led'])]; }); });
        return offer(p, 'שמתי תאורת LED בכל התאים. היא נדלקת כשפותחים דלת, וצריך לתאם נקודת חשמל עם חשמלאי.');
      }
      const prefer = ins === 'shoes' ? ['shelves', 'long'] : ins === 'trousers' ? ['shelves', 'double'] : ['long', 'double'];
      const order = idx != null ? [idx] : prefer.flatMap((p) => L.comps.filter((c) => c.preset === p).map((c) => c.index));
      const target = order.find((i) => !insertBlocked(ins, { ...state.compartments[i], preset: L.comps[i].preset }) && !(ins === 'pulldown' && (L.comps[i].w < PULLDOWN_WIDTH[0] || L.comps[i].w > PULLDOWN_WIDTH[1])));
      if (target == null) {
        if (ins === 'pulldown') return { text: `מתקן נשלף מיוצר רק ברוחב 83–115 ס״מ, והתאים אצלכם ברוחב ${cm(L.comps[0].w)}. אפשר לוותר על תא אחד כדי להרחיב אותם, ואז זה יתאים.` };
        const ok = PRESETS.filter((p) => def.presets.includes(p.id)).map((p) => p.name);
        return { text: `${def.name} צריך תא עם ${joinHe(ok)}${idx != null ? `, ותא ${idx + 1} מסודר אחרת` : ''}. אם תרצו, נשנה קודם את הסידור של אחד התאים.` };
      }
      const c = L.comps[target];
      const why = ins === 'shoes'
        ? `שמתי אותם בתא ${target + 1}${c.preset === 'shelves' ? ', כי שם יש מדפים ולא תלייה שתתקצר' : ''}. נכנסים שם בערך ${3 * Math.floor(c.w / 220)} זוגות.`
        : ins === 'trousers' ? `בתא ${target + 1}, מתחת למדף בגובה של כ-${cm(77 + 720)} ס״מ.` : `בתא ${target + 1}, במקום המוט העליון.`;
      return offer(proposal(state, `${def.name} בתא ${target + 1}`, (s) => { const x = s.compartments[target]; x.inserts = [...new Set([...(x.inserts ?? []), ins])]; }), why);
    }
    // Interior presets.
    const preset = /מגיר/.test(t) ? 'drawers' : /מדפ/.test(t) ? 'shelves' : /כפול/.test(t) ? 'double' : /ארוכ|מעיל|שמל/.test(t) ? 'long' : null;
    if (preset && idx != null) return offer(proposal(state, `תא ${idx + 1}: ${PRESETS.find((p) => p.id === preset).name}`, (s) => { s.compartments[idx].preset = preset; }), '');
    if (preset) return { text: `לאיזה תא? יש ${n} תאים, ואני סופר אותם משמאל לימין.` };
    // Compartment count.
    if (/(הוסף|תוסיף|עוד).*(תא)/.test(t)) {
      const p = proposal(state, 'תא נוסף', (s) => { s.compartments.push({ preset: 'shelves', split: false, inserts: [] }); });
      return offer(p, `עם ${n + 1} תאים כל אחד יוצא בערך ${cm(p.L.comps[0].w)} ס״מ.`);
    }
    if (/(הסר|תוריד|פחות).*(תא)/.test(t)) {
      if (n <= 1) return { text: 'יש רק תא אחד, אין מה להוריד.' };
      const p = proposal(state, 'תא אחד פחות', (s) => { s.compartments.pop(); });
      return offer(p, `עם ${n - 1} תאים כל אחד יוצא בערך ${cm(p.L.comps[0].w)} ס״מ.`);
    }

    return { text: 'לא בטוח שהבנתי עד הסוף. אפשר לנסח אחרת? למשל לבקש לשנות מידה, להוסיף משהו לתא מסוים, או לספר לי מה צריך להיכנס לארון, ואני אציע סידור.' };
  }

  return { reply, reset: () => { memory = null; } };
}
