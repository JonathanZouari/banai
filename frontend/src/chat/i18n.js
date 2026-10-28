// Chat panel strings in Hebrew, English and French. The agent replies only in the language a message
// is written in; sending a message switches the chat to that language, so UI and replies always match.
// The switch also sets the language for messages without letters (e.g. "240?").

export const LANGUAGES = Object.freeze(['he', 'en', 'fr']);
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
  }),
  fr: Object.freeze({
    dir: 'ltr',
    switchLabel: 'Langue du chat',
    title: 'Designer IA',
    subtitle: 'Assistant de conception',
    online: 'En ligne',
    onlineTitle: 'Le designer IA est connecté.',
    comingSoon: 'Bientôt',
    comingSoonTitle: "Le designer IA n'est pas encore connecté.",
    placeholder: 'Décrivez votre armoire…',
    inputLabel: 'Message au designer',
    send: 'Envoyer le message',
    mic: 'Parler au designer',
    micStop: "Arrêter l'enregistrement et envoyer",
    recording: 'Enregistrement… appuyez à nouveau pour envoyer',
    transcribing: 'Transcription en cours…',
    micDenied: "Pas d'accès au micro. Autorisez-le dans le navigateur, ou tapez votre message.",
    voiceError: "Je n'ai pas compris l'enregistrement. Veuillez réessayer.",
    readAloud: 'Lire les réponses à voix haute (voix générée par IA)',
    readAloudOn: 'Les réponses seront lues avec une voix générée par IA.',
    hint: 'Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne',
    welcomeLabel: 'Pour commencer',
    welcomeTitle: "Que concevons-nous aujourd'hui ?",
    welcomeText: "Décrivez votre armoire avec vos propres mots. J'en ferai une proposition que vous confirmerez avant tout changement.",
    suggestions: Object.freeze([
      'Armoire de 240 cm de large et 260 cm de haut, blanche, avec trois compartiments',
      'Armoire haute avec portes coulissantes et une tringle de penderie',
      'Quatre étagères à gauche, penderie au milieu et trois tiroirs à droite',
    ]),
    conversation: 'Conversation',
    thinking: 'Le designer réfléchit',
    proposalHeading: 'Modifications proposées',
    changeCount: (n) => (n === 1 ? '1 modification' : `${n} modifications`),
    proposalNote: 'Pas encore appliqué. Confirmez pour appliquer ces modifications à votre design.',
    confirm: 'Confirmer',
    cancel: 'Annuler',
    notConnected: "Le designer IA n'est pas encore connecté. Vous pouvez concevoir manuellement dans le panneau Propriétés.",
    stale: 'Le design a changé. Demandez une nouvelle proposition au designer.',
    agentError: "Le designer n'a pas pu répondre pour le moment. Réessayez dans un instant.",
    applied: 'Appliqué. Votre design a été mis à jour.',
    notApplied: "La proposition n'a pas pu être appliquée. Rien n'a été modifié.",
    cancelled: "Proposition annulée. Aucune modification n'a été faite.",
    readyForProfile: 'Votre design est prêt ? Téléchargez le fichier pour votre menuisier.',
    generateProfile: 'Generate Style Profile',
    composerHints: Object.freeze({
      guided: "Parlez-moi de l'espace : quelle largeur et quelle hauteur pour l'armoire ?",
      freeText: 'Par ex. 240 cm de large, 260 cm de haut, blanche, trois compartiments',
    }),
  }),
});

export const stringsFor = (language) => STRINGS[language] ?? STRINGS[DEFAULT_LANGUAGE];

// English and French share the Latin script, so they are told apart by French letters and common
// words. Mirrors backend app/agent/language.py: keep the word lists identical (a unit test compares
// them, and both sides run shared/fixtures/language/detect.json).
const FRENCH_LETTERS = 'àâæçéèêëîïôœùûüÿ';
const LATIN = new RegExp(`[a-z${FRENCH_LETTERS}]`, 'iu');
const FRENCH_LETTER = new RegExp(`[${FRENCH_LETTERS}]`, 'iu');
const WORD = new RegExp(`[a-z${FRENCH_LETTERS}]+`, 'gu');
const FRENCH_LETTER_WEIGHT = 2; // an accented French letter counts as two French words
const words = (list) => new Set(list.trim().split(/\s+/));
export const FRENCH_WORDS = words(`
je j tu il elle nous vous le la les l un une des du de d au aux et ou avec pour dans sur sous
entre sans mais donc est sont suis peux peut pouvez veux voudrais aimerais faire fais faites mettre
mets ajoute ajouter ajoutez enleve enlever supprime supprimer changer mon ma mes ton ta votre vos
ce cette ces qui que qu quoi comment pourquoi quel quelle bonjour salut merci oui non bien
armoire placard porte portes tiroir tiroirs etagere etageres étagère étagères penderie tringle
caisson cloison cloisons compartiment compartiments largeur hauteur profondeur haut haute profond
profonde blanc blanche noir noire gris grise bois chene chêne noyer laque laqué brillant
coulissante coulissantes battante battantes gauche droite milieu deux trois quatre cinq
`);
export const ENGLISH_WORDS = words(`
i you we it the an and or with for in of to from at by is are be can could would should please
want need like make add remove change put give set my your this that these what how why which
hello hi hey thanks thank yes no okay wardrobe closet cabinet door doors drawer drawers shelf
shelves rail hanging compartment compartments partition partitions width wide height high tall
depth deep white black grey gray wood oak walnut glossy gloss matte sliding hinged left right
middle two three four five more less bigger smaller
`);

/**
 * 'he' | 'en' | 'fr' | null (no letters). Hebrew wins in mixed text. Latin text with no clue
 * either way keeps `current` when that is English or French, else English.
 */
export function detectLanguage(text, current = null) {
  if (/[א-ת]/.test(text)) return 'he';
  if (!LATIN.test(text)) return null;
  const found = text.toLowerCase().match(WORD) ?? [];
  let french = found.filter((word) => FRENCH_WORDS.has(word)).length;
  if (FRENCH_LETTER.test(text)) french += FRENCH_LETTER_WEIGHT;
  const english = found.filter((word) => ENGLISH_WORDS.has(word)).length;
  if (french !== english) return french > english ? 'fr' : 'en';
  return current === 'en' || current === 'fr' ? current : 'en';
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
