import { VISUAL } from '../units.js';
import { box } from './frame.js';

export const PLINTH_RECESS = 30; // mm: the plinth board sits this far behind the front face

/**
 * Side, top, bottom and back panels, plus the plinth board when there is a plinth. Sides run
 * the full height; the bottom panel sits on the plinth and the back fills the interior between
 * bottom and top. All select as the single `carcass` component.
 */
export function buildCarcass(frame, material) {
  const { width, height, depth, panel, plinth, baseY, innerHeight } = frame;
  const userData = (part) => ({ componentId: 'carcass', kind: 'carcass', part });
  const innerW = width - 2 * panel;
  const parts = [
    box({ size: [panel, height, depth], center: [panel / 2, height / 2, -depth / 2], material, userData: userData('left') }),
    box({ size: [panel, height, depth], center: [width - panel / 2, height / 2, -depth / 2], material, userData: userData('right') }),
    box({ size: [innerW, panel, depth], center: [width / 2, plinth + panel / 2, -depth / 2], material, userData: userData('bottom') }),
    box({ size: [innerW, panel, depth], center: [width / 2, height - panel / 2, -depth / 2], material, userData: userData('top') }),
    box({
      size: [innerW, innerHeight, VISUAL.backThickness],
      center: [width / 2, baseY + innerHeight / 2, -depth + VISUAL.backThickness / 2],
      material,
      userData: userData('back'),
    }),
  ];
  if (plinth > 0) {
    parts.push(box({
      size: [innerW, plinth, panel],
      center: [width / 2, plinth / 2, -PLINTH_RECESS - panel / 2],
      material,
      userData: userData('plinth'),
    }));
  }
  return parts;
}
