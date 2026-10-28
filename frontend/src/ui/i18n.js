// Site language (Hebrew or English) for the whole interface. Hebrew is the default and turns the
// page right-to-left. The chat keeps its own language switch (chat/i18n.js); changing the site
// language also moves the chat to it (main.js). Static markup uses data-i18n attributes; modules
// that build DOM call t() and re-render on change.
export const SITE_LANGUAGES = Object.freeze(['he', 'en']);
export const DEFAULT_SITE_LANGUAGE = 'he';
const STORAGE_KEY = 'banai.site.language';

const CATALOG_HE = Object.freeze({
  melamine: 'לוח מלמין', oak_veneer: 'פורניר אלון', lacquered_mdf: 'MDF צבוע', solid_oak: 'עץ אלון מלא',
  white: 'לבן', light_grey: 'אפור בהיר', anthracite: 'אנתרציט', black: 'שחור', natural_oak: 'אלון טבעי',
  walnut: 'אגוז', olive_green: 'ירוק זית', navy_blue: 'כחול נייבי', terracotta: 'טרקוטה',
  matte: 'מט', satin: 'סאטן', gloss: 'מבריק',
});

const STRINGS = Object.freeze({
  en: Object.freeze({
    dir: 'ltr',
    // Top bar and static page
    skipToProperties: 'Skip to properties',
    appTitle: 'BanAI Wardrobe Designer',
    tagline: 'Wardrobe Designer',
    theme: 'Theme',
    themeNames: { terracotta: 'Terracotta', sage: 'Sage', slate: 'Slate', midnight: 'Midnight', neon: 'Neon' },
    showInterior: 'Show interior',
    units: 'cm',
    render: 'Render',
    save: 'Save',
    accessibility: 'Accessibility',
    switchLanguage: 'עברית',
    switchLanguageLabel: 'החלפת שפת האתר לעברית',
    viewer: '3D viewer',
    canvas: '3D wardrobe view. Every part is also listed under All parts in the Properties panel.',
    cameraGroup: 'Camera angle',
    views: { front: 'Front', side: 'Right side', sideLeft: 'Left side', threeQuarter: '3/4', reset: 'Reset' },
    rotate: 'Rotate 360',
    properties: 'Properties',
    propertiesHint: 'Select a component in the 3D view, or under All parts below, to edit it.',
    chatPanel: 'AI designer',
    serviceDown: 'Could not reach the design service. Please check your connection and reload.',
    bootFailed: 'The designer could not start. Please reload the page.',
    // Start screen
    startTitle: 'Design your wardrobe',
    startSubtitle: 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.',
    startFootnote: 'Designs are illustrative previews and are not manufacturing drawings.',
    accessibilityStatement: 'Accessibility statement',
    entries: {
      guided: { title: 'Guide me', description: 'Answer a few questions and the AI designer will propose a wardrobe for you to confirm.', action: 'Start guided flow' },
      freeText: { title: 'Describe it', description: 'Type your wardrobe in your own words. The AI designer turns it into a proposal you approve.', action: 'Enter description' },
      basic: { title: 'Start from a basic wardrobe', description: 'Begin with a standard 200 × 240 × 60 cm wardrobe, then edit it by hand or with the AI.', action: 'Open basic wardrobe' },
    },
    templatesTitle: 'Or start from a template',
    useTemplate: 'Use this template',
    templates: {
      kids: { title: "Kids' wardrobe", description: '100 × 150 × 50 cm · low hanging rail, shelves and drawers' },
      double_sliding: { title: 'Double wardrobe, sliding doors', description: '240 × 240 × 65 cm · two sliding doors, hanging at both ends' },
      minimalist: { title: 'Minimalist wardrobe', description: '180 × 220 × 60 cm · white lacquer, a rail and three shelves' },
    },
    // Properties panel
    wardrobe: 'Wardrobe',
    width: 'Width',
    height: 'Height',
    depth: 'Depth',
    doors: 'Doors',
    doorTypes: { hinged: 'Hinged', sliding: 'Sliding', none: 'None' },
    slidingPanels: 'Sliding panels',
    materials: 'Materials',
    carcassInterior: 'Carcass & interior',
    compartments: 'Compartments',
    compartmentN: (n) => `Compartment ${n}`,
    remove: 'Remove',
    addCompartment: '+ Add compartment',
    styleProfile: 'Generate Style Profile',
    allParts: 'All parts',
    doorN: (n) => `Door ${n}`,
    partitionN: (n) => `Partition ${n}`,
    itemN: (compartment, name, n) => `Compartment ${compartment} · ${name} ${n}`,
    kinds: { shelf: 'Shelf', drawer: 'Drawer', rail: 'Hanging rail', compartment: 'Compartment', partition: 'Partition', door: 'Door', carcass: 'Wardrobe body' },
    selected: (kind) => `Selected · ${kind}`,
    heightFromBase: 'Height from base',
    thickness: 'Thickness',
    drawerHeight: 'Drawer height',
    positionFromLeft: 'Position from left',
    hingeSide: 'Hinge side',
    sides: { left: 'Left', right: 'Right' },
    finishes: { shelf: 'Shelf finish', drawer: 'Drawer front', door: 'Door finish' },
    useInherited: { door: 'Use door finish', carcass: 'Use carcass finish' },
    add: { shelf: '+ Shelf', drawer: '+ Drawer', rail: '+ Rail' },
    carcassNote: 'Edit the overall dimensions and materials in the Wardrobe section.',
    deselect: 'Deselect',
    deleteKind: (kind) => `Delete ${kind.toLowerCase()}`,
    colour: 'Colour',
    material: 'Material',
    finish: 'Finish',
    custom: (name) => `Custom: ${name}`,
    customColour: 'Custom colour',
    customColourMenu: 'Custom colour…',
    customColourName: 'Custom colour name',
    customColourPlaceholder: 'Name, e.g. Sage green',
    applyCustomColour: 'Apply custom colour',
    wholeNumber: 'Enter a whole number',
    enterCm: 'Enter a number in cm, e.g. 64.5',
    tooLarge: 'That value is too large',
    errors: {
      OVERLAP: 'That would overlap another shelf or drawer. Choose a different position.',
      OUT_OF_BOUNDS: 'That position is not inside the wardrobe.',
      OUT_OF_RANGE: 'That value is outside the allowed range.',
      WIDTH_MISMATCH: 'The widths no longer add up to the wardrobe width.',
      DOOR_INVALID: 'That door arrangement is not possible here.',
      NOT_FOUND: 'That component no longer exists.',
      INVALID_OP: 'That change is not possible for this component.',
      UNKNOWN_CATALOG_ID: 'That material or colour is not in the catalog.',
      SCHEMA_INVALID: 'That value is not valid.',
    },
    errorFallback: 'The change could not be applied.',
    // 3D view labels
    dimW: (cm) => `W ${cm} cm`,
    dimH: (cm) => `H ${cm} cm`,
    dimD: (cm) => `D ${cm} cm`,
    describeWardrobe: (w, h, d) => `Wardrobe · ${w} × ${h} × ${d} cm`,
    describeCompartment: (n, w) => `Compartment ${n} · width ${w} cm`,
    describeShelf: (y, t) => `Shelf · ${y} cm from base · ${t} cm thick`,
    describeDrawer: (y, h) => `Drawer · ${y} cm from base · ${h} cm high`,
    describeRail: (y) => `Hanging rail · ${y} cm from base`,
    describePartition: (n, t) => `Partition ${n} · ${t} cm thick`,
    describeDoor: (sliding, hinge) => `${sliding ? 'Sliding' : 'Hinged'} door${hinge ? ` · hinge ${hinge}` : ''}`,
    // Dialogs
    close: 'Close',
    saveTitle: 'Save your design',
    saveText: 'Saving gives you a private link you can use to reopen and keep editing this design. No account is needed.',
    privateLink: 'Private link',
    privateLinkLabel: 'Private share link',
    linkPlaceholder: 'Your private link will appear here',
    linkNote: 'Anyone with this link can edit the design, so keep it private.',
    saveUnavailable: 'Saving is not available on this server.',
    saveReady: 'Save to get your private link.',
    saved: 'Saved. Use this link to reopen and keep editing.',
    copyLink: 'Copy link',
    linkCopied: 'Link copied.',
    copyManually: 'Select the link and copy it.',
    saveDesign: 'Save design',
    saving: 'Saving…',
    saveFailed: 'Saving failed. Please try again.',
    renderTitle: 'Photorealistic render',
    renderText: 'Create an illustrative image of your wardrobe on a clean background. Your design and its dimensions are not changed.',
    renderPlaceholder: 'Your render will appear here',
    renderDisclaimer: 'Illustrative image, not the accurate 3D model',
    renderUnavailable: 'Rendering is not available yet. It arrives with the AI rendering phase.',
    generateRender: 'Generate render',
    exportTitle: 'PDF for your carpenter',
    exportText: 'Download a picture of your wardrobe with dimensioned drawings (front with doors, interior, side and top), build steps and a component list. All measurements are in mm.',
    documentLanguage: 'Document language',
    exportNote: 'Design drawing to explain the intent. Construction details are decided by the carpenter.',
    downloadPdf: 'Download PDF',
    preparingPdf: 'Preparing your PDF…',
    pdfDownloading: 'Your PDF is downloading.',
    pdfFailed: 'The PDF could not be created. Please try again.',
  }),
  he: Object.freeze({
    dir: 'rtl',
    skipToProperties: 'דלג למאפיינים',
    appTitle: 'BanAI מעצב ארונות',
    tagline: 'מעצב ארונות',
    theme: 'ערכת צבעים',
    themeNames: { terracotta: 'טרקוטה', sage: 'מרווה', slate: 'צפחה', midnight: 'חצות', neon: 'ניאון' },
    showInterior: 'הצג פנים',
    units: 'ס"מ',
    render: 'הדמיה',
    save: 'שמירה',
    accessibility: 'נגישות',
    switchLanguage: 'English',
    switchLanguageLabel: 'Switch the site to English',
    viewer: 'תצוגה תלת-ממדית',
    canvas: 'תצוגה תלת-ממדית של הארון. כל החלקים מופיעים גם תחת "כל החלקים" בפאנל המאפיינים.',
    cameraGroup: 'זווית מצלמה',
    views: { front: 'חזית', side: 'צד ימין', sideLeft: 'צד שמאל', threeQuarter: '3/4', reset: 'איפוס' },
    rotate: 'סיבוב 360',
    properties: 'מאפיינים',
    propertiesHint: 'בחר רכיב בתצוגה התלת-ממדית, או תחת "כל החלקים" למטה, כדי לערוך אותו.',
    chatPanel: 'מעצב AI',
    serviceDown: 'אין חיבור לשירות העיצוב. בדוק את החיבור ורענן את הדף.',
    bootFailed: 'לא הצלחנו להפעיל את המעצב. רענן את הדף.',
    startTitle: 'עצב את הארון שלך',
    startSubtitle: 'בחר איך להתחיל. אפשר לעבור בין מעצב ה-AI לעריכה ידנית בכל שלב.',
    startFootnote: 'העיצובים הם הדמיה להמחשה בלבד ואינם שרטוטי ייצור.',
    accessibilityStatement: 'הצהרת נגישות',
    entries: {
      guided: { title: 'הדרך אותי', description: 'ענה על כמה שאלות, ומעצב ה-AI יציע לך ארון לאישור.', action: 'התחל שאלון מודרך' },
      freeText: { title: 'תאר במילים', description: 'כתוב את הארון במילים שלך, ומעצב ה-AI יהפוך את זה להצעה שתאשר.', action: 'כתוב תיאור' },
      basic: { title: 'התחל מארון בסיסי', description: 'התחל מארון סטנדרטי של ‎200 × 240 × 60‎ ס"מ, וערוך אותו ידנית או עם ה-AI.', action: 'פתח ארון בסיסי' },
    },
    templatesTitle: 'או התחל מתבנית',
    useTemplate: 'בחר תבנית זו',
    templates: {
      kids: { title: 'ארון ילדים', description: '‎100 × 150 × 50‎ ס"מ · מוט תלייה נמוך, מדפים ומגירות' },
      double_sliding: { title: 'ארון זוגי עם דלתות הזזה', description: '‎240 × 240 × 65‎ ס"מ · שתי דלתות הזזה, תלייה בשני הצדדים' },
      minimalist: { title: 'ארון מינימליסטי', description: '‎180 × 220 × 60‎ ס"מ · לכה לבנה, מוט תלייה ושלושה מדפים' },
    },
    wardrobe: 'ארון',
    width: 'רוחב',
    height: 'גובה',
    depth: 'עומק',
    doors: 'דלתות',
    doorTypes: { hinged: 'ציר', sliding: 'הזזה', none: 'ללא' },
    slidingPanels: 'כנפי הזזה',
    materials: 'חומרים',
    carcassInterior: 'גוף ופנים',
    compartments: 'תאים',
    compartmentN: (n) => `תא ${n}`,
    remove: 'הסר',
    addCompartment: '+ הוסף תא',
    styleProfile: 'הפק פרופיל סגנון',
    allParts: 'כל החלקים',
    doorN: (n) => `דלת ${n}`,
    partitionN: (n) => `מחיצה ${n}`,
    itemN: (compartment, name, n) => `תא ${compartment} · ${name} ${n}`,
    kinds: { shelf: 'מדף', drawer: 'מגירה', rail: 'מוט תלייה', compartment: 'תא', partition: 'מחיצה', door: 'דלת', carcass: 'גוף הארון' },
    selected: (kind) => `נבחר · ${kind}`,
    heightFromBase: 'גובה מהבסיס',
    thickness: 'עובי',
    drawerHeight: 'גובה מגירה',
    positionFromLeft: 'מיקום מהשמאל',
    hingeSide: 'צד הציר',
    sides: { left: 'שמאל', right: 'ימין' },
    finishes: { shelf: 'גימור המדף', drawer: 'חזית המגירה', door: 'גימור הדלת' },
    useInherited: { door: 'השתמש בגימור הדלתות', carcass: 'השתמש בגימור הגוף' },
    add: { shelf: '+ מדף', drawer: '+ מגירה', rail: '+ מוט' },
    carcassNote: 'את המידות והחומרים הכלליים עורכים באזור "ארון".',
    deselect: 'בטל בחירה',
    deleteKind: (kind) => `מחק ${kind}`,
    colour: 'צבע',
    material: 'חומר',
    finish: 'גימור',
    custom: (name) => `מותאם: ${name}`,
    customColour: 'צבע מותאם',
    customColourMenu: 'צבע מותאם…',
    customColourName: 'שם הצבע המותאם',
    customColourPlaceholder: 'שם, למשל ירוק מרווה',
    applyCustomColour: 'החל צבע מותאם',
    wholeNumber: 'הזן מספר שלם',
    enterCm: 'הזן מספר בס"מ, למשל 64.5',
    tooLarge: 'הערך גדול מדי',
    errors: {
      OVERLAP: 'זה יחפוף מדף או מגירה אחרים. בחר מיקום אחר.',
      OUT_OF_BOUNDS: 'המיקום הזה מחוץ לארון.',
      OUT_OF_RANGE: 'הערך מחוץ לטווח המותר.',
      WIDTH_MISMATCH: 'סכום הרוחבים כבר לא שווה לרוחב הארון.',
      DOOR_INVALID: 'סידור הדלתות הזה לא אפשרי כאן.',
      NOT_FOUND: 'הרכיב הזה כבר לא קיים.',
      INVALID_OP: 'השינוי הזה לא אפשרי ברכיב הזה.',
      UNKNOWN_CATALOG_ID: 'החומר או הצבע לא נמצאים בקטלוג.',
      SCHEMA_INVALID: 'הערך לא תקין.',
    },
    errorFallback: 'לא ניתן היה להחיל את השינוי.',
    dimW: (cm) => `רוחב ${cm} ס"מ`,
    dimH: (cm) => `גובה ${cm} ס"מ`,
    dimD: (cm) => `עומק ${cm} ס"מ`,
    describeWardrobe: (w, h, d) => `ארון · ‎${w} × ${h} × ${d}‎ ס"מ`,
    describeCompartment: (n, w) => `תא ${n} · רוחב ${w} ס"מ`,
    describeShelf: (y, t) => `מדף · ${y} ס"מ מהבסיס · עובי ${t} ס"מ`,
    describeDrawer: (y, h) => `מגירה · ${y} ס"מ מהבסיס · גובה ${h} ס"מ`,
    describeRail: (y) => `מוט תלייה · ${y} ס"מ מהבסיס`,
    describePartition: (n, t) => `מחיצה ${n} · עובי ${t} ס"מ`,
    describeDoor: (sliding, hinge) => `דלת ${sliding ? 'הזזה' : 'ציר'}${hinge ? ` · ציר ${hinge === 'left' ? 'משמאל' : 'מימין'}` : ''}`,
    close: 'סגור',
    saveTitle: 'שמירת העיצוב',
    saveText: 'השמירה נותנת לך קישור פרטי שאיתו אפשר לפתוח את העיצוב ולהמשיך לערוך אותו. אין צורך בחשבון.',
    privateLink: 'קישור פרטי',
    privateLinkLabel: 'קישור שיתוף פרטי',
    linkPlaceholder: 'הקישור הפרטי שלך יופיע כאן',
    linkNote: 'כל מי שיש לו את הקישור יכול לערוך את העיצוב, לכן שמור עליו פרטי.',
    saveUnavailable: 'השמירה לא זמינה בשרת הזה.',
    saveReady: 'שמור כדי לקבל קישור פרטי.',
    saved: 'נשמר. השתמש בקישור הזה כדי לפתוח ולהמשיך לערוך.',
    copyLink: 'העתק קישור',
    linkCopied: 'הקישור הועתק.',
    copyManually: 'סמן את הקישור והעתק אותו.',
    saveDesign: 'שמור עיצוב',
    saving: 'שומר…',
    saveFailed: 'השמירה נכשלה. נסה שוב.',
    renderTitle: 'הדמיה פוטו-ריאליסטית',
    renderText: 'צור תמונה להמחשה של הארון על רקע נקי. העיצוב והמידות שלו לא משתנים.',
    renderPlaceholder: 'ההדמיה תופיע כאן',
    renderDisclaimer: 'תמונה להמחשה, לא המודל התלת-ממדי המדויק',
    renderUnavailable: 'ההדמיה עדיין לא זמינה. היא תגיע בשלב ההדמיות של ה-AI.',
    generateRender: 'צור הדמיה',
    exportTitle: 'PDF לנגר',
    exportText: 'הורד תמונה של הארון עם שרטוטים ממודדים (חזית עם דלתות, פנים, צד ומבט עליון), שלבי בנייה ורשימת רכיבים. כל המידות במ"מ.',
    documentLanguage: 'שפת המסמך',
    exportNote: 'שרטוט עיצוב שמסביר את הכוונה. פרטי הבנייה נקבעים על ידי הנגר.',
    downloadPdf: 'הורד PDF',
    preparingPdf: 'מכין את ה-PDF…',
    pdfDownloading: 'ה-PDF יורד.',
    pdfFailed: 'לא הצלחנו ליצור את ה-PDF. נסה שוב.',
  }),
});

function readStored(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return SITE_LANGUAGES.includes(value) ? value : null;
  } catch {
    return null; // private mode / blocked storage: just use the default
  }
}

let current = readStored(globalThis.localStorage) ?? DEFAULT_SITE_LANGUAGE;
const listeners = new Set();

/** The current site language ('he' or 'en'). */
export const siteLanguage = () => current;

/** Strings for the current site language (or a given one). */
export const strings = (language = current) => STRINGS[language] ?? STRINGS[DEFAULT_SITE_LANGUAGE];

/** Display name of a catalog entry (material, colour or finish) in the site language. */
export const catalogName = (entry) => (current === 'he' && CATALOG_HE[entry.id]) || entry.name;

/** Change the site language, remember it (best effort) and notify listeners. */
export function setSiteLanguage(next, { storage = globalThis.localStorage } = {}) {
  if (!SITE_LANGUAGES.includes(next) || next === current) return;
  current = next;
  try {
    storage?.setItem(STORAGE_KEY, next);
  } catch {
    // not persisted; the choice still applies for this visit
  }
  listeners.forEach((listener) => listener(current));
}

export function onSiteLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply the language to the page: <html lang/dir>, the title, and every element with
 * data-i18n (text) or data-i18n-<attribute> (e.g. data-i18n-aria-label). Values are dotted keys.
 */
export function applyToDocument(doc = document) {
  const t = strings();
  const lookup = (key) => key.split('.').reduce((value, part) => value?.[part], t);
  doc.documentElement.lang = current;
  doc.documentElement.dir = t.dir;
  doc.title = t.appTitle;
  doc.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = lookup(node.dataset.i18n) ?? node.textContent; });
  doc.querySelectorAll('*').forEach((node) => {
    for (const { name, value } of [...node.attributes]) {
      if (name.startsWith('data-i18n-')) {
        const text = lookup(value);
        if (text !== undefined) node.setAttribute(name.slice('data-i18n-'.length), text);
      }
    }
  });
}

/** Tests only: reset to a language without touching storage or listeners. */
export function _setSiteLanguageForTests(language) {
  current = language;
}
