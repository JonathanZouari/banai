// The ways to start a design (spec section 6; "Last designs" is the third card, see startScreen.js).
// All of them land in the same editor and data model.
export const ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: 'guided',
    icon: 'chat',
    title: 'Guide me',
    description: 'Answer a few questions and the AI designer will propose a wardrobe for you to confirm.',
    action: 'Start guided flow',
    focusesChat: true, // placeholder text per language: i18n/strings.js hintGuided
  }),
  Object.freeze({
    id: 'basic',
    icon: 'wardrobe',
    title: 'Start from a basic wardrobe',
    description: 'Begin with a standard 200 × 240 × 60 cm wardrobe, then edit it by hand or with the AI.',
    action: 'Open basic wardrobe',
    focusesChat: false,
  }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;
