// UI preferences kept in localStorage. Every access is wrapped in try/catch and unexpected
// stored values are ignored, so the app works with storage blocked or tampered with.
export const CHAT_COLLAPSED_KEY = 'banai.ui.chatCollapsed';
export const SECTIONS_KEY = 'banai.ui.sections';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** true (collapsed), false (expanded) or null when the user has not chosen. */
export function readChatCollapsed(storage = defaultStorage()) {
  try {
    const value = storage?.getItem(CHAT_COLLAPSED_KEY);
    if (value === '1') return true;
    if (value === '0') return false;
  } catch { /* ignore */ }
  return null;
}

export function writeChatCollapsed(collapsed, storage = defaultStorage()) {
  try {
    storage?.setItem(CHAT_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch { /* ignore */ }
}

const SECTION_KEY = /^[a-z][a-z0-9-]{0,31}$/;

/** { [sectionKey]: boolean } (open state); malformed data yields an empty map. */
export function readSectionStates(storage = defaultStorage()) {
  const states = Object.create(null);
  try {
    const parsed = JSON.parse(storage?.getItem(SECTIONS_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([key, value]) => {
        if (SECTION_KEY.test(key) && typeof value === 'boolean') states[key] = value;
      });
    }
  } catch { /* ignore */ }
  return states;
}

export function writeSectionState(key, open, storage = defaultStorage()) {
  try {
    const states = { ...readSectionStates(storage), [key]: Boolean(open) };
    storage?.setItem(SECTIONS_KEY, JSON.stringify(states));
  } catch { /* ignore */ }
}
