// Words for the "What will change" list, per chat language. Kept apart from i18n.js so the card's
// wording can grow without touching the chat panel's strings. Hebrew is gender-neutral where it
// addresses the customer; verbs agree with the part they describe (מדף נוסף, מגירה נוספה).

// Mirrors CATALOG_NAMES["he"] in backend/app/export/strings.py (a unit test keeps them in step
// with catalog.json). Missing ids fall back to the catalog's own (English) name.
export const CATALOG_NAMES_HE = Object.freeze({
  melamine: 'לוח מלמין',
  oak_veneer: 'פורניר אלון',
  lacquered_mdf: 'MDF צבוע',
  birch_plywood: 'דיקט ליבנה',
  white: 'לבן',
  light_grey: 'אפור בהיר',
  anthracite: 'אנתרציט',
  black: 'שחור',
  natural_oak: 'אלון טבעי',
  walnut: 'אגוז',
  sage_green: 'ירוק מרווה',
  navy_blue: 'כחול נייבי',
  sand_beige: "בז' חול",
  matte: 'מט',
  satin: 'סאטן',
  gloss: 'מבריק',
});

const cap = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;
// Hebrew "from X" / "to X": the letter joins a Hebrew word, and takes a maqaf before digits or Latin.
const attach = (letter, text) => (/^[א-ת]/.test(text) ? `${letter}${text}` : `${letter}־${text}`);
const HE_VERBS = Object.freeze({
  added: { m: 'נוסף', f: 'נוספה', many: 'נוספו' },
  removed: { m: 'הוסר', f: 'הוסרה', many: 'הוסרו' },
  moved: { m: 'עבר', f: 'עברה', many: 'עברו' },
  moves: { m: 'זז', f: 'זזה' },
});

export const DIFF_STRINGS = Object.freeze({
  he: Object.freeze({
    cm: 'ס״מ',
    group: { wardrobe: 'ארון', doors: 'דלתות', compartment: (n) => `תא ${n}` },
    part: {
      shelf: { one: 'מדף', many: 'מדפים', gender: 'm' },
      drawer: { one: 'מגירה', many: 'מגירות', gender: 'f' },
      rail: { one: 'מוט תלייה', many: 'מוטות תלייה', gender: 'm' },
    },
    label: {
      width: 'רוחב', height: 'גובה', depth: 'עומק', compartmentWidth: 'רוחב',
      material: 'חומר', color: 'צבע', finish: 'גימור',
      doorType: 'סוג דלתות', doorCount: 'מספר דלתות', layout: 'חלוקה חדשה לתאים',
      shelfThickness: 'עובי מדף', drawerHeight: 'גובה מגירה', hinge: 'ציר',
    },
    the: {
      width: 'הרוחב', height: 'הגובה', depth: 'העומק', material: 'החומר', color: 'הצבע', finish: 'הגימור',
      thickness: 'העובי', hinge: 'הציר', doorType: 'סוג הדלתות', doorCount: 'מספר הדלתות',
    },
    of: (what, whose) => `${what} של ${whose}`,
    itemProp: (prop, part, n) => `${prop} של ${part} בתא ${n}`,
    carcass: 'גוף הארון',
    doors: 'הדלתות',
    door: (n) => `דלת ${n}`,
    partition: (n) => `מחיצה ${n}`,
    doorLabel: (field, n) => `${field} · דלת ${n}`,
    itemLabel: (field, part) => `${field} ${part}`,
    partitionLabel: (n) => `עובי מחיצה ${n}`,
    doorType: { hinged: 'צירים', sliding: 'הזזה', none: 'ללא דלתות' },
    side: { left: 'שמאל', right: 'ימין' },
    custom: 'מותאם אישית',
    bottom: 'בתחתית',
    bottomValue: 'תחתית',
    at: (numbers) => `בגובה ${numbers}`,
    wide: (length) => `ברוחב ${length}`,
    list: (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ו${parts.at(-1)}`),
    changes: (what, from, to) => `${what} משתנה ${attach('מ', from)} ${attach('ל', to)}`,
    // from/to are "190 ס״מ" or the bottom value
    moves: (part, n, from, to) => {
      const point = (text) => (text === 'תחתית' ? 'התחתית' : `גובה ${text}`);
      return `${part.one} בתא ${n} ${HE_VERBS.moves[part.gender]} ${attach('מ', point(from))} ${attach('ל', point(to))}`;
    },
    rowLabel: (type, count, part, from) => {
      if (type === 'moved') return count === 1 ? `${part.one} ${HE_VERBS.moved[part.gender]} מתא ${from}` : `${count} ${part.many} ${HE_VERBS.moved.many} מתא ${from}`;
      if (count > 1) return `${type === 'added' ? '+' : '−'}${count} ${part.many}`;
      return `${part.one} ${HE_VERBS[type][part.gender]}`;
    },
    rowSpoken: (type, count, part, n, where, from) => {
      if (type === 'moved') {
        const verb = count === 1 ? HE_VERBS.moved[part.gender] : HE_VERBS.moved.many;
        return `${count === 1 ? part.one : `${count} ${part.many}`} ${verb} מתא ${from} לתא ${n}, ${where}`;
      }
      const place = type === 'added' ? `בתא ${n}` : `מתא ${n}`;
      if (count === 1) return `${part.one} ${HE_VERBS[type][part.gender]} ${place}, ${where}`;
      return `${HE_VERBS[type].many} ${count} ${part.many} ${place}, ${where}`;
    },
    compartmentAdded: (n) => `תא ${n} נוסף`,
    compartmentRemoved: (n) => `תא ${n} הוסר`,
    layoutSpoken: (from, to) => (from === to ? `חלוקת התאים מוחלפת, עם ${to} תאים` : `חלוקת התאים מוחלפת: ${from} תאים הופכים ל־${to}`),
    more: (n) => (n === 1 ? '+ עוד שינוי אחד' : `+ עוד ${n} שינויים`),
    fewer: 'הצגת פחות',
    none: 'ההצעה לא משנה את העיצוב.',
  }),
  en: Object.freeze({
    cm: 'cm',
    group: { wardrobe: 'Wardrobe', doors: 'Doors', compartment: (n) => `Compartment ${n}` },
    part: {
      shelf: { one: 'shelf', many: 'shelves' },
      drawer: { one: 'drawer', many: 'drawers' },
      rail: { one: 'hanging rail', many: 'hanging rails' },
    },
    label: {
      width: 'Width', height: 'Height', depth: 'Depth', compartmentWidth: 'Width',
      material: 'Material', color: 'Colour', finish: 'Finish',
      doorType: 'Door type', doorCount: 'Number of doors', layout: 'New compartment layout',
      shelfThickness: 'Shelf thickness', drawerHeight: 'Drawer height', hinge: 'Hinge',
    },
    the: {
      width: 'width', height: 'height', depth: 'depth', material: 'material', color: 'colour', finish: 'finish',
      thickness: 'thickness', hinge: 'hinge', doorType: 'door type', doorCount: 'number of doors',
    },
    of: (what, whose) => `${whose} ${what}`,
    itemProp: (prop, part, n) => `${cap(part)} ${prop} in compartment ${n}`,
    carcass: 'Wardrobe body',
    doors: 'Door',
    door: (n) => `Door ${n}`,
    partition: (n) => `Partition ${n}`,
    doorLabel: (field, n) => `Door ${n} ${field.toLowerCase()}`,
    itemLabel: (field, part) => `${cap(part)} ${field.toLowerCase()}`,
    partitionLabel: (n) => `Partition ${n} thickness`,
    doorType: { hinged: 'Hinged', sliding: 'Sliding', none: 'No doors' },
    side: { left: 'left', right: 'right' },
    custom: 'Custom',
    bottom: 'at the bottom',
    bottomValue: 'bottom',
    at: (numbers) => `at ${numbers}`,
    wide: (length) => `${length} wide`,
    list: (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`),
    changes: (what, from, to) => `${cap(what)} changes from ${from} to ${to}`,
    moves: (part, n, from, to) => {
      const point = (text) => (text === 'bottom' ? 'the bottom' : text);
      return `${cap(part.one)} in compartment ${n} moves from ${point(from)} to ${point(to)}`;
    },
    rowLabel: (type, count, part, from) => {
      if (type === 'moved') return `${count === 1 ? cap(part.one) : `${count} ${part.many}`} moved from compartment ${from}`;
      if (count > 1) return `${type === 'added' ? '+' : '−'}${count} ${part.many}`;
      return `${cap(part.one)} ${type}`;
    },
    rowSpoken: (type, count, part, n, where, from) => {
      const what = count === 1 ? cap(part.one) : `${count} ${part.many}`;
      if (type === 'moved') return `${what} moved from compartment ${from} to compartment ${n}, ${where}`;
      return `${what} ${type} ${type === 'added' ? 'in' : 'from'} compartment ${n}, ${where}`;
    },
    compartmentAdded: (n) => `Compartment ${n} added`,
    compartmentRemoved: (n) => `Compartment ${n} removed`,
    layoutSpoken: (from, to) => (from === to ? `The compartment layout is replaced, with ${to} compartments` : `The compartment layout is replaced: ${from} compartments become ${to}`),
    more: (n) => (n === 1 ? '+ 1 more change' : `+ ${n} more changes`),
    fewer: 'Show fewer',
    none: "This proposal doesn't change the design.",
  }),
});

export const diffStringsFor = (language) => DIFF_STRINGS[language] ?? DIFF_STRINGS.he;
