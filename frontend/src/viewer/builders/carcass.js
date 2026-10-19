import * as THREE from 'three';
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

export const LEG_RADIUS = 16; // mm, visual: an adjustable leg's foot
export const LEG_INSET = 45; // mm from the front and the back

export const PLINTH_RECESS = 30; // mm: the plinth board sits this far behind the front face

/**
 * Side, top, bottom and back panels, plus the plinth board when there is a plinth. Sides run
 * the full height; the bottom panel sits on the plinth and the back fills the interior between
 * bottom and top. All select as the single `carcass` component.
 */
/** Leg positions (mm, x and z): under each side and partition, front and back. */
export function legPositions(frame) {
  const xs = [frame.panel / 2, ...frame.ranges.slice(0, -1).map(([, x1]) => x1 + frame.panel / 2), frame.width - frame.panel / 2];
  return xs.flatMap((x) => [[x, -LEG_INSET], [x, -frame.depth + LEG_INSET]]);
}

export function buildCarcass(frame, material, legMaterial = material) {
  const { width, height, depth, panel, plinth, baseY, innerHeight, legs } = frame;
  const userData = (part) => ({ componentId: 'carcass', kind: 'carcass', part });
  const innerW = width - 2 * panel;
  const sideY = legs ? plinth : 0; // on legs the sides start above them
  const parts = [
    box({ size: [panel, height - sideY, depth], center: [panel / 2, sideY + (height - sideY) / 2, -depth / 2], material, userData: userData('left') }),
    box({ size: [panel, height - sideY, depth], center: [width - panel / 2, sideY + (height - sideY) / 2, -depth / 2], material, userData: userData('right') }),
    box({ size: [innerW, panel, depth], center: [width / 2, plinth + panel / 2, -depth / 2], material, userData: userData('bottom') }),
    box({ size: [innerW, panel, depth], center: [width / 2, height - panel / 2, -depth / 2], material, userData: userData('top') }),
    box({
      size: [innerW, innerHeight, VISUAL.backThickness],
      center: [width / 2, baseY + innerHeight / 2, -depth + VISUAL.backThickness / 2],
      material,
      userData: userData('back'),
    }),
  ];
  if (legs && plinth > 0) {
    const geometry = new THREE.CylinderGeometry(toM(LEG_RADIUS), toM(LEG_RADIUS), toM(plinth), 20);
    legPositions(frame).forEach(([x, z], i) => {
      const leg = new THREE.Mesh(i === 0 ? geometry : geometry.clone(), legMaterial);
      leg.position.set(toM(x), toM(plinth / 2), toM(z));
      leg.userData = userData('leg');
      parts.push(leg);
    });
  } else if (plinth > 0) {
    parts.push(box({
      size: [innerW, plinth, panel],
      center: [width / 2, plinth / 2, -PLINTH_RECESS - panel / 2],
      material,
      userData: userData('plinth'),
    }));
  }
  return parts;
}
