// The room's look: wall colours, floors and the light of the day. Pure data, no three.js.
// ASSUMPTION: visual palette. Every wall is darker than a white wardrobe, and every catalog
// colour differs from every wall in lightness or in hue, so the wardrobe stays clearly visible
// against its wall (checked in tests/unit/room/look.test.js).

export const WALL_COLORS = Object.freeze({
  warm: '#e6d6c2',
  sage: '#d3dccd',
  blush: '#e6d3c9',
  stone: '#bfb7ac', // a deeper taupe: a white wardrobe stands out most
});

export const FLOORS = Object.freeze({
  wood: Object.freeze({ kind: 'wood', color: '#b98d63' }),
  tiles: Object.freeze({ kind: 'tiles', color: '#d8d0c4' }),
  carpet: Object.freeze({ kind: 'carpet', color: '#9e9184' }),
});

/** The viewer's lights in each mood (the room changes only these, and restores them when off). */
export const LIGHT_MOODS = Object.freeze({
  // Morning: sun through the window from the front-right, a soft front fill, a sun patch on the floor.
  morning: Object.freeze({
    background: '#e9e4df',
    hemi: { sky: '#fff8ee', ground: '#a8937a', intensity: 1.35 },
    key: { color: '#fff0d8', intensity: 2.1 },
    fill: { color: '#eef1ff', intensity: 0.75 },
    lampGlow: 0,
    sunPatch: 0.22,
  }),
  // Evening: low warm sun, dim sky light, lamps glowing and pooling light on the floor.
  evening: Object.freeze({
    background: '#2e323d',
    hemi: { sky: '#ffd9b0', ground: '#5a4a3c', intensity: 0.6 },
    key: { color: '#ff9f62', intensity: 0.65 },
    fill: { color: '#ffd2a1', intensity: 0.85 },
    lampGlow: 1.4,
    sunPatch: 0,
  }),
});

export const WALL_IDS = Object.freeze(Object.keys(WALL_COLORS));
export const FLOOR_IDS = Object.freeze(Object.keys(FLOORS));
export const LIGHT_IDS = Object.freeze(Object.keys(LIGHT_MOODS));

/** WCAG relative luminance and contrast ratio, for the wardrobe-against-wall check. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
