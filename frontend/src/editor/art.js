// Static line art for the interior presets (28×36 mini elevations) and inserts (20×20), from the
// approved P1 prototype. These are constants, never design data, so parsing them is safe.

export const PRESET_ART = Object.freeze({
  long: '<svg viewBox="0 0 28 36"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M5 11h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 11v17M14 11v20M19 11v15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/></svg>',
  double: '<svg viewBox="0 0 28 36"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M5 10.5h18M2 19h24M5 21.5h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 10.5v6M14 10.5v7M19 10.5v5.5M9 21.5v8M14 21.5v9M19 21.5v7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/></svg>',
  shelves: '<svg viewBox="0 0 28 36"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M2 14.5h24M2 21h24M2 27.5h24" stroke="currentColor" stroke-width="1.4"/></svg>',
  drawers: '<svg viewBox="0 0 28 36"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M2 14.5h24M2 20.5h24" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="22.5" width="20" height="3.4" rx=".8" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="4" y="27" width="20" height="3.4" rx=".8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 24.2h4M12 28.7h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
});

export const INSERT_ART = Object.freeze({
  pulldown: '<svg viewBox="0 0 20 20"><path d="M4 4.5h12M6 4.5l2 6M14 4.5l-2 6M7 10.5h6M10 10.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  shoes: '<svg viewBox="0 0 20 20"><path d="M3 8l14-2M3 13l14-2M3 18l14-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  trousers: '<svg viewBox="0 0 20 20"><path d="M3 5h14M5.5 5v11M8.5 5v11M11.5 5v11M14.5 5v11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  led: '<svg viewBox="0 0 20 20"><path d="M3 5h14M6 8l-1 2M10 8.5v2.5M14 8l1 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  tv: '<svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="9.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 16.5h5M10 13.5v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A decorative SVG node from one of the constants above (aria-hidden). */
export function artNode(markup) {
  const parsed = new DOMParser().parseFromString(markup.replace('<svg ', `<svg xmlns="${SVG_NS}" `), 'image/svg+xml');
  const node = document.importNode(parsed.documentElement, true);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  return node;
}
