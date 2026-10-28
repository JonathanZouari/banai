import { describe, expect, it } from 'vitest';
import { contrast, FLOOR_IDS, LIGHT_IDS, LIGHT_MOODS, luminance, WALL_COLORS, WALL_IDS } from '../../../src/room/look.js';
import { sanitizeRoom } from '../../../src/room/roomState.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();

// CIE Lab colour difference (CIE76), for "differs in hue" when lightness is close.
function lab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

describe('room look', () => {
  it('every wall is clearly darker than a white wardrobe', () => {
    const white = catalog.colors.find((c) => c.id === 'white').hex;
    WALL_IDS.forEach((wall) => expect(contrast(white, WALL_COLORS[wall]), wall).toBeGreaterThanOrEqual(1.2));
  });

  it('every wardrobe colour in the catalog stands out from every wall, in lightness or in hue', () => {
    for (const wall of WALL_IDS) {
      for (const { id, hex } of catalog.colors) {
        const clear = contrast(hex, WALL_COLORS[wall]) >= 1.15 || deltaE(hex, WALL_COLORS[wall]) >= 10;
        expect(clear, `${id} on ${wall}`).toBe(true);
      }
    }
  });

  it('luminance and contrast follow WCAG', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
  });

  it('evening is darker and warmer, with glowing lamps; morning has the sun patch', () => {
    expect(LIGHT_MOODS.evening.hemi.intensity).toBeLessThan(LIGHT_MOODS.morning.hemi.intensity);
    expect(LIGHT_MOODS.evening.lampGlow).toBeGreaterThan(0);
    expect(LIGHT_MOODS.morning.lampGlow).toBe(0);
    expect(LIGHT_MOODS.morning.sunPatch).toBeGreaterThan(0);
    expect(LIGHT_MOODS.evening.sunPatch).toBe(0);
  });

  it('the room setup accepts only known walls, floors and light', () => {
    expect(sanitizeRoom({ wall: 'stone', floor: 'tiles', light: 'evening' })).toMatchObject({ wall: 'stone', floor: 'tiles', light: 'evening' });
    expect(sanitizeRoom({ wall: 'neon', floor: 'lava', light: 'noon' })).toMatchObject({ wall: WALL_IDS[0], floor: FLOOR_IDS[0], light: LIGHT_IDS[0] });
  });
});
