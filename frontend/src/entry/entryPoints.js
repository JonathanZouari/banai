// The three ways to start (spec section 6). All of them land in the same editor and data model.
export const ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: 'guided',
    icon: 'chat',
    title: 'Guide me',
    description: 'Answer a few questions and the AI designer will propose a wardrobe for you to confirm.',
    action: 'Start guided flow',
    focusesChat: true, // placeholder text per language: chat/i18n.js composerHints.guided
  }),
  Object.freeze({
    id: 'freeText',
    icon: 'edit',
    title: 'Describe it',
    description: 'Type your wardrobe in your own words. The AI designer turns it into a proposal you approve.',
    action: 'Enter description',
    focusesChat: true, // composerHints.freeText
  }),
  Object.freeze({
    id: 'basic',
    icon: 'wardrobe',
    title: 'Start from a template',
    description: 'Pick a ready-made wardrobe, then edit it by hand or with the AI.',
    action: 'Open template',
    focusesChat: false,
    choosesPreset: true, // the card shows a template picker (domain/presets.js PRESETS)
  }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;
