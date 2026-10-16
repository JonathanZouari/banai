// UI strings for the chat panel and the agent language. Only English and Hebrew are supported.
// DEFAULT_LANGUAGE is a configurable default, not a business rule.
export const LANGUAGES = Object.freeze(['en', 'he']);
export const DEFAULT_LANGUAGE = 'en';
export const DIRECTIONS = Object.freeze({ en: 'ltr', he: 'rtl' });
const STORAGE_KEY = 'banai.language';

export const STRINGS = Object.freeze({
  en: {
    chatTitle: 'AI Designer',
    chatSubtitle: 'Design assistant',
    statusOnline: 'Online',
    statusOffline: 'Not connected',
    statusOnlineTitle: 'The AI agent proposes changes; nothing is applied until you confirm.',
    statusOfflineTitle: 'The AI agent is not connected.',
    placeholder: 'Describe your wardrobe…',
    inputLabel: 'Message to the AI designer',
    sendLabel: 'Send message',
    hint: 'Enter to send · Shift+Enter for a new line',
    welcomeAria: 'Get started',
    welcomeTitle: 'What shall we design today?',
    welcomeText: "Describe your wardrobe in your own words. I'll turn it into a proposal that you confirm before anything changes.",
    suggestions: [
      '240 cm wide, 260 cm tall, white, three compartments',
      'Tall wardrobe with sliding doors and a hanging rail',
      'Four shelves on the left, hanging in the middle, three drawers on the right',
    ],
    conversation: 'Conversation',
    thinking: 'Thinking…',
    notConnected: "The AI agent isn't connected yet (planned for Phase 5). You can design manually in the Properties panel.",
    unavailable: "The AI agent isn't available right now. You can keep designing manually in the Properties panel.",
    stale: 'Design changed. Ask the agent to re-propose.',
    cancelled: 'Proposal cancelled. No changes were made.',
    applied: 'Changes applied to your design.',
    applyFailed: 'The changes could not be applied.',
    undone: 'Last change undone.',
    errNetwork: 'Could not reach the server.',
    errBusy: 'The AI service is at its usage limit. Please try again in a few minutes.',
    errTimeout: 'The AI agent took too long. Please try again.',
    errUnavailable: 'The AI agent is unavailable. Please try again.',
    errQuota: 'The AI service has run out of credits. Please contact the site owner.',
    proposalAria: 'Proposed changes',
    proposalHeading: 'Proposed changes',
    item: 'item',
    items: 'items',
    proposalNote: 'Not applied yet. Confirm to apply these changes to your design.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    languageLabel: 'Assistant language',
  },
  he: {
    chatTitle: 'מעצב AI',
    chatSubtitle: 'עוזר עיצוב',
    statusOnline: 'מחובר',
    statusOffline: 'לא מחובר',
    statusOnlineTitle: 'הסוכן מציע שינויים; שום דבר לא מתבצע עד שתאשרו.',
    statusOfflineTitle: 'סוכן ה-AI אינו מחובר.',
    placeholder: 'תארו את הארון שלכם…',
    inputLabel: 'הודעה למעצב ה-AI',
    sendLabel: 'שליחת הודעה',
    hint: 'Enter לשליחה · Shift+Enter לשורה חדשה',
    welcomeAria: 'תחילת עבודה',
    welcomeTitle: 'מה נעצב היום?',
    welcomeText: 'תארו את הארון במילים שלכם. אהפוך זאת להצעה שתאשרו לפני שמשהו ישתנה.',
    suggestions: [
      'רוחב 240 ס״מ, גובה 260 ס״מ, לבן, שלושה תאים',
      'ארון גבוה עם דלתות הזזה ומוט תלייה',
      'ארבע מדפים בצד שמאל, תלייה באמצע, שלוש מגירות בצד ימין',
    ],
    conversation: 'שיחה',
    thinking: 'חושב…',
    notConnected: 'סוכן ה-AI עדיין אינו מחובר. אפשר לעצב ידנית בלוח המאפיינים.',
    unavailable: 'סוכן ה-AI אינו זמין כרגע. אפשר להמשיך לעצב ידנית בלוח המאפיינים.',
    stale: 'העיצוב השתנה. בקשו מהסוכן להציע מחדש.',
    cancelled: 'ההצעה בוטלה. לא בוצעו שינויים.',
    applied: 'השינויים הוחלו על העיצוב שלכם.',
    applyFailed: 'לא ניתן היה להחיל את השינויים.',
    undone: 'השינוי האחרון בוטל.',
    errNetwork: 'לא ניתן להתחבר לשרת.',
    errBusy: 'שירות ה-AI הגיע למגבלת השימוש. נסו שוב בעוד כמה דקות.',
    errTimeout: 'סוכן ה-AI לקח יותר מדי זמן. נסו שוב.',
    errUnavailable: 'סוכן ה-AI אינו זמין. נסו שוב.',
    errQuota: 'שירות ה-AI נגמר באשראי. אנא פנו לבעלי האתר.',
    proposalAria: 'שינויים מוצעים',
    proposalHeading: 'שינויים מוצעים',
    item: 'פריט',
    items: 'פריטים',
    proposalNote: 'עדיין לא הוחל. אשרו כדי להחיל את השינויים על העיצוב.',
    confirm: 'אישור',
    cancel: 'ביטול',
    languageLabel: 'שפת העוזר',
  },
});

// API error codes -> string keys (the server's English messages are never shown in Hebrew).
const ERROR_KEYS = Object.freeze({
  NETWORK: 'errNetwork',
  AGENT_BUSY: 'errBusy',
  AGENT_TIMEOUT: 'errTimeout',
  AGENT_QUOTA: 'errQuota',
  AGENT_NOT_CONFIGURED: 'notConnected',
  AGENT_UNAVAILABLE: 'errUnavailable',
  STALE: 'stale',
});

export const isLanguage = (value) => LANGUAGES.includes(value);

export function translate(language, key) {
  return (STRINGS[isLanguage(language) ? language : DEFAULT_LANGUAGE] ?? STRINGS[DEFAULT_LANGUAGE])[key] ?? STRINGS[DEFAULT_LANGUAGE][key];
}

/** Localized message for an API error, or the generic "unavailable" text. */
export function errorMessage(language, error) {
  return translate(language, ERROR_KEYS[error?.code] ?? 'unavailable');
}

function readStored(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Language store. Persistence is a per-viewer convenience: it is optional and never throws. */
export function createLanguage(storage = globalThis.localStorage) {
  let current = readStored(storage) ?? DEFAULT_LANGUAGE;
  const listeners = new Set();
  return {
    get: () => current,
    dir: () => DIRECTIONS[current],
    t: (key) => translate(current, key),
    set(next) {
      if (!isLanguage(next)) return false;
      if (next === current) return true;
      current = next;
      try { storage?.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
      listeners.forEach((listener) => listener(current));
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
