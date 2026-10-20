// Inline Material-style icons (24px grid), so no icon font or CDN is needed (CSP font-src 'self').
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = Object.freeze({
  send: 'M2 21l21-9L2 3v7l15 2-15 2z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  close: 'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  save: 'M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zM15 9H5V5h10v4z',
  image: 'M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z',
  copy: 'M16 1H4a2 2 0 00-2 2v14h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z',
  chat: 'M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
  edit: 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  wardrobe: 'M4 2h16a1 1 0 011 1v18a1 1 0 01-1 1h-1v1h-2v-1H7v1H5v-1H4a1 1 0 01-1-1V3a1 1 0 011-1zm7 2H5v16h6V4zm2 0v16h6V4h-6zm-3 8h-2v2h2v-2zm4 0h-2v2h2v-2z',
  arrow: 'M12 4l-1.4 1.4 5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8z',
  sparkle: 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z',
  stop: 'M8 6h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z',
  mic: 'M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z',
  volumeOff: 'M16.5 12A4.5 4.5 0 0014 8v2.2l2.5 2.5V12zM19 12a7 7 0 01-.9 3.4l1.5 1.5A9 9 0 0021 12a9 9 0 00-7-8.8v2.1a7 7 0 015 6.7zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.1v2.1a9 9 0 003.7-1.8l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2V4z',
  info: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 100 20 10 10 0 000-20z',
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.96 7.96 0 0112.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78A10.5 10.5 0 0012.5 8z',
  redo: 'M18.4 10.6A10.4 10.4 0 0011.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16a8 8 0 017.6-5.5c1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
  more: 'M12 8a2 2 0 100-4 2 2 0 000 4zm0 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z',
  settings: 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7 7 0 00-1.63-.94l-.36-2.54A.5.5 0 0013.9 2.4h-3.84a.5.5 0 00-.5.42l-.36 2.54a7 7 0 00-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.66 8.84a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54a7 7 0 001.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.6a3.6 3.6 0 110-7.2 3.6 3.6 0 010 7.2z',
  doors: 'M4 2h16a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm1 2v16h6V4H5zm8 0v16h6V4h-6zm-4 7h1v3H9v-3zm5 0h1v3h-1v-3z',
  interior: 'M4 2h16a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm1 2v4h14V4H5zm0 6v4h14v-4H5zm0 6v4h14v-4H5zm6-11h2v2h-2V5z',
  reset: 'M12 5V1L7 6l5 5V7a6 6 0 11-6 6H4a8 8 0 108-8z',
  mirror: 'M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zm1 2v16h12V4H6zm2.3 9.3l5-5 1.4 1.4-5 5-1.4-1.4zm0 4l8-8 1.4 1.4-8 8-1.4-1.4z',
});

/** Returns an <svg> icon element. Unknown names throw, so typos fail loudly in tests. */
export function icon(name, { size = 20 } = {}) {
  const path = PATHS[name];
  if (!path) throw new Error(`Unknown icon: ${name}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  svg.append(shape);
  return svg;
}

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));
