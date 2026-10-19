// ASSUMPTION: configurable prototype defaults for rendering safety and convenience,
// NOT approved business or manufacturing rules. Mirrors backend/app/domain/defaults.py.
// This module imports nothing (avoids import cycles); presets live in presets.js.

import { deepFreeze } from './util.js';

// [min, max] inclusive, in millimetres unless noted.
export const LIMITS = deepFreeze({
  width: [300, 6000],
  height: [300, 3500],
  depth: [200, 1200],
  panelThickness: [5, 50],
  partitionThickness: [5, 50],
  compartmentWidth: [50, 6000],
  shelfThickness: [5, 60],
  drawerHeight: [50, 1000],
  compartmentCount: [1, 20],
  slidingDoorCount: [1, 6],
  // schema v2
  plinthHeight: [0, 300],
  ceiling: [1500, 5000],
  niche: [300, 10000],
  clearance: [100, 10000], // free floor in front of the wardrobe
  personHeight: [450, 2300], // a household member, for scale and child safety
  releaseHeight: [900, 2200], // the child lock's release button, above the floor
  // wall obstacles: x from the wardrobe's left outer face (may be left of it), y from the floor
  obstacleX: [-5000, 10000],
  obstacleY: [0, 5000],
  obstacleSize: [10, 5000],
  // the room (ADR-037): a template's overall size, its parts (a cut, a recess) and where the wardrobe stands
  roomSize: [1000, 15000],
  roomPart: [300, 14700],
  roomOffset: [0, 15000],
  shoeTiers: [1, 6],
  insertHeight: [200, 1500],
  zones: [1, 4],
});

export const MAX_OBSTACLES = 8; // wall obstacles in one site
export const OBSTACLE_TYPES = Object.freeze(['socket', 'switch', 'ac', 'pipe', 'window', 'panel', 'other']);
// Which limit each obstacle field takes.
export const OBSTACLE_LIMITS = Object.freeze({ x: 'obstacleX', y: 'obstacleY', width: 'obstacleSize', height: 'obstacleSize' });

export const DEFAULT_PANEL_THICKNESS = 18;

// Child safety (prototype defaults, not research values): a person under CHILD_HEIGHT counts as a child; the
// lock's release goes at least RELEASE_MIN above the floor and above the tallest child's overhead reach,
// estimated as 1.3 x height, rounded up to 50 mm. Mirrors defaults.py.
export const CHILD_HEIGHT = 1400;
export const RELEASE_MIN = 1500;
export function releaseHeightFor(people) {
  const children = people.filter((p) => p.height < CHILD_HEIGHT).map((p) => p.height);
  const reach = children.length ? Math.floor((Math.max(...children) * 13 + 499) / 500) * 50 : 0;
  return Math.max(RELEASE_MIN, reach);
}
export const DEFAULT_SHELF_THICKNESS = 18;
export const DEFAULT_SLIDING_DOOR_COUNT = 2;
export const DEFAULT_PLINTH_HEIGHT = 0; // no plinth unless asked for; new designs from the UI pass one explicitly

// Schema v2 interior inserts. A shoe tier is 220-260 mm in the research [35].
export const INSERT_TYPES = Object.freeze(['pulldown', 'shoes', 'trousers', 'led', 'tv']);
export const SHOE_TIER = 240;
export const DEFAULT_SHOE_TIERS = 3;
export const DEFAULT_TROUSER_HEIGHT = 700;
export const PULLDOWN_DROP = 400; // default pull-down rail height below the interior top
// A flat screen insert: 16:9, sized by its diagonal in inches. Its centre defaults to a seated viewing height.
export const TV_DEFAULT_INCHES = 43;
export const TV_CENTER_HEIGHT = 1100; // mm above the floor, a prototype default
/** The height (mm) of a 16:9 screen with this diagonal: d x 25.4 x 9 / sqrt(16^2 + 9^2). */
export const screenHeight = (inches) => Math.floor(inches * 25.4 * 9 / Math.sqrt(337) + 0.5);
export const screenWidth = (height) => Math.floor(height * 16 / 9 + 0.5);
export const screenInches = (height) => Math.floor(height * Math.sqrt(337) / (25.4 * 9) + 0.5);
/** The largest screen up to TV_DEFAULT_INCHES that leaves 100 mm of air each side [research 118], at least 24. */
export function largestScreen(compartmentWidth) {
  let fits = Math.max(0, Math.floor((compartmentWidth - 200) * Math.sqrt(337) / (25.4 * 16)));
  while (fits > 0 && screenWidth(screenHeight(fits)) > compartmentWidth - 200) fits -= 1;
  return fits;
}
export const defaultScreenInches = (compartmentWidth) => Math.max(24, Math.min(TV_DEFAULT_INCHES, largestScreen(compartmentWidth)));

/** Root handle style/finish of a new design (doors and drawers inherit it). */
export const defaultHandles = () => ({ style: 'bar', finish: 'steel' });

export const defaultAppearance = () => ({
  material: { catalogId: 'melamine' },
  color: { catalogId: 'white' },
  finish: { catalogId: 'matte' },
});
