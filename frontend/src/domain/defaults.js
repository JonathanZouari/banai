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
  doorShelfDepth: [60, 150],
});

export const DEFAULT_PANEL_THICKNESS = 18;
export const DEFAULT_SHELF_THICKNESS = 18;
export const DEFAULT_SLIDING_DOOR_COUNT = 2;
// Shelves on the inside face of a hinged door: board thickness (visual + overlap span) and depth.
export const DOOR_SHELF_THICKNESS = 12;
export const DEFAULT_DOOR_SHELF_DEPTH = 100;

export const defaultAppearance = () => ({
  material: { catalogId: 'melamine' },
  color: { catalogId: 'white' },
  finish: { catalogId: 'matte' },
});
