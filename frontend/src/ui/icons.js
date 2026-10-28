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
  // Start-screen feature chips
  hinged: 'M5 3h11v18H5V3zm9 8h-2v2h2v-2zM18 5h1v14h-1z',
  sliding: 'M3 4h18v2H3zM4 7h8v13H4zm8 2h8v11h-8z',
  open: 'M4 3h16v18h-2V5H6v16H4V3zm4 5h8v2H8V8zm0 5h8v2H8v-2z',
  drawers: 'M4 4h16v7H4zm0 9h16v7H4zm6-7v2h4V6zm0 9v2h4v-2z',
  double: 'M3 4h18v2H3zm0 9h18v2H3zM11 6h2v3l3 3H8l3-3zm0 9h2v2l3 3H8l3-3z',
  long: 'M3 3h18v2H3zm8 2h2v3l4 4-1 10H8L7 12l4-4z',
  child: 'M12 2a3 3 0 110 6 3 3 0 010-6zm-4 8h8l-1 6h-2v6h-2v-6H9z',
  sparkle: 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z',
  info: 'M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 100 20 10 10 0 000-20z',
  mic: 'M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5.3-3a5.3 5.3 0 01-10.6 0H5a7 7 0 006 6.9V21h2v-3.1a7 7 0 006-6.9h-1.7z',
  stop: 'M6 6h12v12H6z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z',
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
