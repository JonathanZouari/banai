// Chat panel strings in Hebrew, English and Spanish. The agent replies only in the language a message is
// written in; sending a message switches the chat to that language, so UI and replies always match.
// The switch also sets the language for messages without letters (e.g. "240?").

export const LANGUAGES = Object.freeze(['he', 'en', 'es']);
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
    tour: Object.freeze({
      replay: 'סיור היכרות',
      progress: (n, total) => `${n} מתוך ${total}`,
      next: 'הבא',
      back: 'הקודם',
      skip: 'דלג',
      done: 'סיום',
      steps: Object.freeze({
        chat: Object.freeze({
          title: 'כאן מדברים עם המעצב',
          body: 'תאר במילים שלך מה אתה רוצה, והמעצב יציע שינויים. שום דבר לא משתנה עד שתלחץ "אישור".',
        }),
        editor: Object.freeze({
          title: 'כאן עורכים ידנית',
          body: 'שנה מידות, תאים, מדפים, מגירות וחומרים. כל שינוי מופיע מיד בתלת־ממד.',
        }),
        viewer: Object.freeze({
          title: 'כאן מסובבים את הארון',
          body: 'גרור כדי לסובב, גלול כדי להתקרב, ולחץ על חלק כדי לבחור אותו.',
        }),
      }),
    }),
    // The room around the wardrobe (room/roomControls.js). Decoration only. Gender-neutral wording.
    room: Object.freeze({
      button: 'הצג בחדר',
      panel: 'החדר',
      collapse: 'מזעור פאנל החדר',
      expand: 'הרחבת פאנל החדר',
      note: 'קישוט בלבד: החדר לא נשמר בעיצוב ולא מופיע בקובץ לנגר.',
      size: 'מידות החדר',
      width: 'רוחב',
      length: 'אורך',
      ceiling: 'תקרה',
      cm: 'ס״מ',
      clamped: 'החדר הוגדל כדי שהארון ייכנס בו.',
      wardrobeAt: 'מיקום הארון על הקיר',
      positions: Object.freeze({ left: 'שמאל', centre: 'מרכז', right: 'ימין' }),
      style: 'סגנון החדר',
      presets: Object.freeze({ couple: 'חדר שינה זוגי', kids: 'חדר ילדים', teen: 'חדר נוער עם פינת גיימינג' }),
      furniture: Object.freeze({
        doubleBed: 'מיטה זוגית', singleBed: 'מיטת יחיד', nightstand: 'שידת לילה', desk: 'שולחן כתיבה', gamingDesk: 'שולחן גיימינג',
        chair: 'כיסא', gamingChair: 'כיסא גיימינג', rug: 'שטיח', floorLamp: 'מנורה עומדת', plant: 'עציץ',
      }),
      notFit: (names) => `לא נכנס בגודל החדר הזה: ${names}.`,
      walls: 'קירות',
      wallNames: Object.freeze({ warm: 'גוון חם', sage: 'מרווה', blush: 'ורוד עדין', stone: 'טאופ' }),
      floor: 'רצפה',
      floors: Object.freeze({ wood: 'פרקט עץ', tiles: 'אריחים', carpet: 'שטיח מקיר לקיר' }),
      light: 'תאורה',
      lights: Object.freeze({ morning: 'בוקר', evening: 'ערב' }),
      view: 'מבט',
      views: Object.freeze({ doorway: 'מהדלת', bed: 'מהמיטה', plan: 'תוכנית קומה', overview: 'כל החדר' }),
      viewPurpose: Object.freeze({
        doorway: 'הרושם הראשון, בגובה העיניים, כמו בכניסה לחדר.',
        bed: 'מה שרואים כל יום, בישיבה במיטה.',
        plan: 'מבט מלמעלה, לסידור ולבדיקת המרחב.',
        overview: 'כל החדר במבט אחד.',
      }),
      hintTitle: 'חדש: הארון בתוך חדר',
      hintText: 'אפשר לראות איך הארון משתלב בחדר, בגודל אמיתי. קישוט בלבד, לא נשמר בעיצוב.',
      hintShow: 'להציג בחדר',
      hintDismiss: 'לא עכשיו',
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
    tour: Object.freeze({
      replay: 'Take the tour',
      progress: (n, total) => `${n} of ${total}`,
      next: 'Next',
      back: 'Back',
      skip: 'Skip',
      done: 'Done',
      steps: Object.freeze({
        chat: Object.freeze({
          title: 'Talk to the designer here',
          body: 'Describe what you want in your own words and the designer proposes changes. Nothing changes until you press Confirm.',
        }),
        editor: Object.freeze({
          title: 'Edit by hand here',
          body: 'Change sizes, compartments, shelves, drawers and materials. Every change shows up in 3D right away.',
        }),
        viewer: Object.freeze({
          title: 'Turn the wardrobe here',
          body: 'Drag to rotate, scroll to zoom, and click a part to select it.',
        }),
      }),
    }),
    room: Object.freeze({
      button: 'View in a room',
      panel: 'Room',
      collapse: 'Collapse the room panel',
      expand: 'Expand the room panel',
      note: 'Decoration only: the room is not saved with the design and is not in the carpenter file.',
      size: 'Room size',
      width: 'Width',
      length: 'Length',
      ceiling: 'Ceiling',
      cm: 'cm',
      clamped: 'The room was enlarged so the wardrobe fits.',
      wardrobeAt: 'Wardrobe position on the wall',
      positions: Object.freeze({ left: 'Left', centre: 'Centre', right: 'Right' }),
      style: 'Room style',
      presets: Object.freeze({ couple: "Couple's bedroom", kids: "Kids' room", teen: 'Teen room with a gaming corner' }),
      furniture: Object.freeze({
        doubleBed: 'double bed', singleBed: 'single bed', nightstand: 'nightstand', desk: 'desk', gamingDesk: 'gaming desk',
        chair: 'chair', gamingChair: 'gaming chair', rug: 'rug', floorLamp: 'floor lamp', plant: 'plant',
      }),
      notFit: (names) => `Doesn't fit in this room size: ${names}.`,
      walls: 'Walls',
      wallNames: Object.freeze({ warm: 'Warm white', sage: 'Sage', blush: 'Blush', stone: 'Taupe' }),
      floor: 'Floor',
      floors: Object.freeze({ wood: 'Wood', tiles: 'Tiles', carpet: 'Carpet' }),
      light: 'Light',
      lights: Object.freeze({ morning: 'Morning', evening: 'Evening' }),
      view: 'View',
      views: Object.freeze({ doorway: 'From the doorway', bed: 'From the bed', plan: 'Floor plan', overview: 'Whole room' }),
      viewPurpose: Object.freeze({
        doorway: 'The first impression, at eye level, as you walk in.',
        bed: 'What you see every day, sitting up in bed.',
        plan: 'From above, to arrange and check the space.',
        overview: 'The whole room at a glance.',
      }),
      hintTitle: 'New: your wardrobe in a room',
      hintText: 'See how the wardrobe fits into a room, at its real size. Decoration only, not saved with the design.',
      hintShow: 'View in a room',
      hintDismiss: 'Not now',
    }),
  }),
  es: Object.freeze({
    dir: 'ltr',
    switchLabel: 'Idioma del chat',
    title: 'Diseñador IA',
    subtitle: 'Asistente de diseño',
    online: 'En línea',
    onlineTitle: 'El diseñador con IA está conectado.',
    comingSoon: 'Próximamente',
    comingSoonTitle: 'El diseñador con IA aún no está conectado.',
    placeholder: 'Describe tu armario…',
    inputLabel: 'Mensaje para el diseñador',
    send: 'Enviar mensaje',
    mic: 'Habla con el diseñador',
    micStop: 'Detener la grabación y enviar',
    recording: 'Grabando… pulsa de nuevo para enviar',
    transcribing: 'Convirtiendo la voz en texto…',
    micDenied: 'No hay acceso al micrófono. Permítelo en el navegador o escribe tu mensaje.',
    voiceError: 'No he entendido la grabación. Inténtalo de nuevo.',
    readAloud: 'Leer las respuestas en voz alta (voz generada por IA)',
    readAloudOn: 'Las respuestas se leerán con una voz generada por IA.',
    hint: 'Enter para enviar · Shift+Enter para una línea nueva',
    welcomeLabel: 'Empecemos',
    welcomeTitle: '¿Qué diseñamos hoy?',
    welcomeText: 'Describe tu armario con tus propias palabras. Lo convertiré en una propuesta que confirmas antes de que cambie nada.',
    suggestions: Object.freeze([
      'Armario de 240 cm de ancho y 260 cm de alto, blanco, con tres compartimentos',
      'Armario alto con puertas correderas y una barra de colgar',
      'Cuatro estantes a la izquierda, barra en el centro y tres cajones a la derecha',
    ]),
    conversation: 'Conversación',
    thinking: 'El diseñador está pensando',
    proposalHeading: 'Cambios propuestos',
    changeCount: (n) => (n === 1 ? '1 cambio' : `${n} cambios`),
    proposalNote: 'Aún no se ha aplicado. Confirma para aplicar estos cambios a tu diseño.',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    notConnected: 'El diseñador con IA aún no está conectado. Puedes diseñar a mano en el panel de propiedades.',
    stale: 'El diseño cambió. Pide al diseñador una nueva propuesta.',
    agentError: 'El diseñador no ha podido responder ahora. Inténtalo de nuevo en un momento.',
    applied: 'Aplicado. Tu diseño se ha actualizado.',
    notApplied: 'No se pudo aplicar la propuesta. No se ha cambiado nada.',
    cancelled: 'Propuesta cancelada. No se ha cambiado nada.',
    readyForProfile: '¿Tu diseño está listo? Descarga el archivo para tu carpintero.',
    generateProfile: 'Generate Style Profile',
    composerHints: Object.freeze({
      guided: 'Háblame del espacio: ¿qué ancho y alto debe tener el armario?',
      freeText: 'p. ej. 240 cm de ancho, 260 cm de alto, blanco, tres compartimentos',
    }),
  }),
});

export const stringsFor = (language) => STRINGS[language] ?? STRINGS[DEFAULT_LANGUAGE];

// Words only one of English and Spanish uses (shared spellings such as "no", "me", "color" are left
// out, and so are catalog names, which Spanish messages use too). Mirrors backend app/agent/language.py;
// parity: shared/fixtures/language/detect.json.
const SPANISH_WORDS = new Set(`
quiero quisiera armario armarios puerta puertas estante estantes balda baldas cajon cajón cajones ancho
alto altura profundidad fondo añade añadir agrega agregar pon poner haz hacer quita quitar cambia cambiar
con una uno el la los las del de en y para por que qué más mas menos blanco negro madera nogal roble
barra colgar centímetros centimetros compartimento compartimentos hola gracias cuánto cuanto cuesta
precio medio izquierda derecha corredera correderas batiente batientes espejo listo terminado gris
`.split(/\s+/).filter(Boolean));
const ENGLISH_WORDS = new Set(`
the and with add make please wardrobe shelf shelves door doors drawer drawers wide tall high deep rail
hanging i want can you what how much change remove set to of in on it is left right middle white black
sliding hinged mirror hello hi thanks cost done finished grey gray
`.split(/\s+/).filter(Boolean));

/**
 * 'he' | 'en' | 'es' | null (no letters). Hebrew wins in mixed text. Latin text is Spanish or English
 * by its Spanish marks and by words only one language uses; a tie (e.g. "240 cm") keeps `chosen` when
 * it is English or Spanish, else English. Mirrors backend app/agent/language.py (detect).
 */
export function detectLanguage(text, chosen = null) {
  if (/[א-ת]/.test(text)) return 'he';
  if (!/[A-Za-zñáéíóúüÑÁÉÍÓÚÜ]/.test(text)) return null;
  const lowered = text.toLowerCase();
  const words = lowered.match(/[a-zñáéíóúü]+/g) ?? [];
  const spanish = 2 * (lowered.match(/[ñáéíóúü¿¡]/g) ?? []).length + words.filter((word) => SPANISH_WORDS.has(word)).length;
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  if (spanish !== english) return spanish > english ? 'es' : 'en';
  return chosen === 'en' || chosen === 'es' ? chosen : 'en';
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
