// The three ways to start (spec section 6). All of them land in the same editor and data model.
// Titles, descriptions and button labels live in ui/i18n.js (strings().entries / .templates);
// each card's illustration in entry/illustrations.js.
import { TEMPLATES } from '../domain/presets.js';

export const ENTRY_POINTS = Object.freeze([
  // focusesChat: the composer gets a localized placeholder (chat/i18n.js composerHints.<id>).
  Object.freeze({ id: 'guided', focusesChat: true }),
  Object.freeze({ id: 'freeText', focusesChat: true }),
  Object.freeze({ id: 'basic', focusesChat: false }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;

// Extra ready-made starting points, shown below the three entry points. Each opens the manual
// editor with a template design (domain/presets.js TEMPLATES) instead of the basic wardrobe.
export const TEMPLATE_ENTRIES = Object.freeze(TEMPLATES.map((template) => Object.freeze({
  id: `template-${template.id}`,
  templateId: template.id,
  focusesChat: false,
})));
