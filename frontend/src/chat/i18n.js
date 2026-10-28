// Chat panel strings in Hebrew and English. The agent replies only in the language a message is
// written in; sending a message switches the chat to that language, so UI and replies always match.
// The switch also sets the language for messages without letters (e.g. "240?").

export const LANGUAGES = Object.freeze(['he', 'en']);
export const DEFAULT_LANGUAGE = 'he';
const STORAGE_KEY = 'banai.chat.language';

export const STRINGS = Object.freeze({
  he: Object.freeze({
    dir: 'rtl',
    switchLabel: 'שפת הצ׳אט',
    title: 'מעצב AI',
    subtitle: 'עוזר עיצוב',
    online: 'מחובר',
    onlineTitle: 'המעצב החכם מחובר.',
    comingSoon: 'בקרוב',
    comingSoonTitle: 'המעצב החכם עדיין לא מחובר.',
    placeholder: 'תאר את הארון שלך…',
    inputLabel: 'הודעה למעצב',
    send: 'שליחת הודעה',
    mic: 'דבר עם המעצב',
    micStop: 'עצור הקלטה ושלח',
    recording: 'מקליט… לחץ שוב כדי לשלוח',
    transcribing: 'ממיר דיבור לטקסט…',
    micDenied: 'אין גישה למיקרופון. אפשר גישה בדפדפן או הקלד את ההודעה.',
    voiceError: 'לא הצלחתי להבין את ההקלטה. נסה שוב.',
    readAloud: 'הקראת תשובות (קול שנוצר ב-AI)',
    readAloudOn: 'התשובות יוקראו בקול שנוצר ב-AI.',
    hint: 'Enter לשליחה · Shift+Enter לשורה חדשה',
    welcomeLabel: 'בואו נתחיל',
    welcomeTitle: 'מה נעצב היום?',
    welcomeText: 'תאר את הארון במילים שלך, ואני אהפוך את זה להצעה שתאשר לפני שמשהו משתנה.',
    suggestions: Object.freeze([
      'ארון ברוחב 240 ס"מ וגובה 260 ס"מ, לבן, עם שלושה תאים',
      'ארון גבוה עם דלתות הזזה ומוט תלייה',
      'ארבעה מדפים משמאל, תלייה באמצע ושלוש מגירות מימין',
    ]),
    conversation: 'שיחה',
    thinking: 'המעצב חושב',
    proposalHeading: 'שינויים מוצעים',
    changeCount: (n) => (n === 1 ? 'שינוי אחד' : `${n} שינויים`),
    proposalNote: 'עדיין לא הוחל. לחץ על אישור כדי להחיל את השינויים על העיצוב.',
    confirm: 'אישור',
    cancel: 'ביטול',
    notConnected: 'המעצב החכם עדיין לא מחובר. אפשר לעצב ידנית בפאנל המאפיינים.',
    stale: 'העיצוב השתנה. בקש מהמעצב הצעה חדשה.',
    agentError: 'המעצב לא הצליח לענות כרגע. נסה שוב בעוד רגע.',
    applied: 'השינויים הוחלו. העיצוב שלך עודכן.',
    notApplied: 'לא ניתן היה להחיל את ההצעה. לא בוצע שום שינוי.',
    cancelled: 'ההצעה בוטלה. לא בוצע שום שינוי.',
    readyForProfile: 'העיצוב שלך מוכן? אפשר להוריד את הקובץ לנגר.',
    generateProfile: 'Generate Style Profile',
    composerHints: Object.freeze({
      guided: 'ספר לי על החלל: מה הרוחב והגובה של הארון?',
      freeText: 'לדוגמה: ארון ברוחב 240 ס"מ וגובה 260 ס"מ, לבן, עם שלושה תאים',
    }),
    // Start screen (entry/startScreen.js). Gender-neutral wording.
    start: Object.freeze({
      title: 'עיצוב הארון שלך',
      subtitle: 'אפשר להתחיל בשיחה עם מעצב ה־AI או מתבנית מוכנה, ובכל שלב לעבור לעריכה ידנית.',
      languageLabel: 'שפה',
      entries: Object.freeze({
        guided: Object.freeze({ title: 'שיחה מודרכת', description: 'כמה שאלות, והמעצב מציע ארון לאישור.' }),
        freeText: Object.freeze({ title: 'תיאור חופשי', description: 'מתארים במילים, והמעצב הופך את זה להצעה.' }),
      }),
      galleryTitle: 'התחלה מתבנית',
      galleryHint: (n) => `${n} תבניות · אפשר לשנות הכול אחר כך`,
      cm: 'ס״מ',
      insideView: 'מבט פנימה',
      rendering: 'מכין תצוגה…',
      footnote: 'העיצובים הם תצוגה להמחשה בלבד ואינם שרטוטי ייצור.',
      accessibility: 'הצהרת נגישות',
      templates: Object.freeze({
        basic: Object.freeze({ name: 'ארון בסיסי', story: 'התחלה מאוזנת: מדפים, תלייה ומגירות.' }),
        kids: Object.freeze({ name: 'ארון ילדים 150 ס״מ', story: 'מוט ומדפים נמוכים שילד יכול להגיע אליהם.' }),
        double: Object.freeze({ name: 'ארון כפול עם דלתות הזזה', story: 'תלייה ארוכה וקצרה זו לצד זו, מאחורי דלתות הזזה.' }),
        minimal: Object.freeze({ name: 'ארון מינימליסטי', story: 'קווים נקיים ומעט חלקים: מוט אחד ושלושה מדפים.' }),
      }),
      features: Object.freeze({
        hinged: 'דלתות ציר', sliding: 'דלתות הזזה', open: 'ללא דלתות', drawers: 'מגירות',
        double: 'תלייה כפולה', long: 'תלייה ארוכה', child: 'בגובה ילד',
      }),
      // The thumbnail's alt text, built from the design itself.
      alt: ({ size, compartments, doors, rails, shelves, drawers }) => {
        const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
        const parts = [
          count(compartments, 'תא אחד', 'תאים'),
          { hinged: 'דלתות ציר', sliding: 'דלתות הזזה', none: 'ללא דלתות' }[doors],
          ...(rails ? [count(rails, 'מוט תלייה אחד', 'מוטות תלייה')] : []),
          ...(shelves ? [count(shelves, 'מדף אחד', 'מדפים')] : []),
          ...(drawers ? [count(drawers, 'מגירה אחת', 'מגירות')] : []),
        ];
        const last = parts.at(-1);
        return `תצוגה תלת־ממדית: ארון ${size} עם ${parts.slice(0, -1).join(', ')} ${/^[א-ת]/.test(last) ? 'ו' : 'ו־'}${last}.`;
      },
    }),
  }),
  en: Object.freeze({
    dir: 'ltr',
    switchLabel: 'Chat language',
    title: 'AI Designer',
    subtitle: 'Design assistant',
    online: 'Online',
    onlineTitle: 'The AI designer is connected.',
    comingSoon: 'Coming soon',
    comingSoonTitle: 'The AI designer is not connected yet.',
    placeholder: 'Describe your wardrobe…',
    inputLabel: 'Message to the designer',
    send: 'Send message',
    mic: 'Talk to the designer',
    micStop: 'Stop recording and send',
    recording: 'Recording… press again to send',
    transcribing: 'Turning speech into text…',
    micDenied: 'No microphone access. Allow it in the browser, or type your message.',
    voiceError: "I couldn't understand the recording. Please try again.",
    readAloud: 'Read replies aloud (AI-generated voice)',
    readAloudOn: 'Replies will be read aloud in an AI-generated voice.',
    hint: 'Enter to send · Shift+Enter for a new line',
    welcomeLabel: 'Get started',
    welcomeTitle: 'What shall we design today?',
    welcomeText: "Describe your wardrobe in your own words. I'll turn it into a proposal you confirm before anything changes.",
    suggestions: Object.freeze([
      '240 cm wide, 260 cm tall, white, three compartments',
      'Tall wardrobe with sliding doors and a hanging rail',
      'Four shelves on the left, hanging in the middle, three drawers on the right',
    ]),
    conversation: 'Conversation',
    thinking: 'The designer is thinking',
    proposalHeading: 'Proposed changes',
    changeCount: (n) => (n === 1 ? '1 change' : `${n} changes`),
    proposalNote: 'Not applied yet. Confirm to apply these changes to your design.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    notConnected: "The AI designer isn't connected yet. You can design manually in the Properties panel.",
    stale: 'Design changed. Ask the designer to re-propose.',
    agentError: "The designer couldn't answer just now. Please try again in a moment.",
    applied: 'Applied. Your design has been updated.',
    notApplied: 'The proposal could not be applied. Nothing was changed.',
    cancelled: 'Proposal cancelled. No changes were made.',
    readyForProfile: 'Is your design ready? Download the file for your carpenter.',
    generateProfile: 'Generate Style Profile',
    composerHints: Object.freeze({
      guided: 'Tell me about the space: how wide and tall should the wardrobe be?',
      freeText: 'e.g. 240 cm wide, 260 cm tall, white, three compartments',
    }),
    start: Object.freeze({
      title: 'Design your wardrobe',
      subtitle: 'Start with the AI designer or from a ready template, and switch to manual editing at any time.',
      languageLabel: 'Language',
      entries: Object.freeze({
        guided: Object.freeze({ title: 'Guide me', description: 'A few questions, then a wardrobe to confirm.' }),
        freeText: Object.freeze({ title: 'Describe it', description: 'Say it in your own words; the designer proposes it.' }),
      }),
      galleryTitle: 'Start from a template',
      galleryHint: (n) => `${n} templates · change anything later`,
      cm: 'cm',
      insideView: 'Inside view',
      rendering: 'Rendering preview…',
      footnote: 'Designs are illustrative previews and are not manufacturing drawings.',
      accessibility: 'Accessibility statement',
      templates: Object.freeze({
        basic: Object.freeze({ name: 'Basic wardrobe', story: 'A balanced start: shelves, hanging and drawers.' }),
        kids: Object.freeze({ name: "Kids' wardrobe 150 cm", story: 'Low rail and shelves a child can reach.' }),
        double: Object.freeze({ name: 'Double wardrobe with sliding doors', story: 'Long and short hanging side by side, behind sliding doors.' }),
        minimal: Object.freeze({ name: 'Minimalist wardrobe', story: 'Clean lines and few parts: one rail and three shelves.' }),
      }),
      features: Object.freeze({
        hinged: 'Hinged doors', sliding: 'Sliding doors', open: 'No doors', drawers: 'Drawers',
        double: 'Double hanging', long: 'Long hanging', child: 'Child height',
      }),
      alt: ({ size, compartments, doors, rails, shelves, drawers }) => {
        const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
        const parts = [
          count(compartments, 'compartment', 'compartments'),
          { hinged: 'hinged doors', sliding: 'sliding doors', none: 'no doors' }[doors],
          ...(rails ? [count(rails, 'hanging rail', 'hanging rails')] : []),
          ...(shelves ? [count(shelves, 'shelf', 'shelves')] : []),
          ...(drawers ? [count(drawers, 'drawer', 'drawers')] : []),
        ];
        return `3D preview: a ${size} wardrobe with ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
      },
    }),
  }),
});

export const stringsFor = (language) => STRINGS[language] ?? STRINGS[DEFAULT_LANGUAGE];

/** 'he' | 'en' | null (no letters). Hebrew wins in mixed text. Mirrors backend app/agent/language.py. */
export function detectLanguage(text) {
  if (/[א-ת]/.test(text)) return 'he';
  if (/[A-Za-z]/.test(text)) return 'en';
  return null;
}

function readStored(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value) ? value : null;
  } catch {
    return null; // private mode / blocked storage: just use the default
  }
}

/** The chosen chat language, remembered per browser (best effort). */
export function createLanguage({ storage = globalThis.localStorage, initial } = {}) {
  let language = LANGUAGES.includes(initial) ? initial : readStored(storage) ?? DEFAULT_LANGUAGE;
  const listeners = new Set();
  return {
    get: () => language,
    strings: () => stringsFor(language),
    set(next) {
      if (!LANGUAGES.includes(next) || next === language) return;
      language = next;
      try {
        storage?.setItem(STORAGE_KEY, next);
      } catch {
        // not persisted; the choice still applies for this visit
      }
      listeners.forEach((listener) => listener(language));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
