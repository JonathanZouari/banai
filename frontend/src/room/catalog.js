// Furniture in the room: sizes only (mm), no three.js. Each piece stands with its back toward a
// wall: width along the wall, depth into the room. `height` is its tallest point (for sightlines
// and the window). Underlays (rugs) lie flat under other pieces. Visual prototype sizes.

export const FURNITURE = Object.freeze({
  doubleBed: Object.freeze({ width: 1640, depth: 2100, height: 880 }),
  singleBed: Object.freeze({ width: 960, depth: 2100, height: 820 }),
  nightstand: Object.freeze({ width: 460, depth: 400, height: 860 }), // with its table lamp
  desk: Object.freeze({ width: 1200, depth: 600, height: 760 }),
  gamingDesk: Object.freeze({ width: 1400, depth: 700, height: 1260 }), // with monitor and PC tower
  chair: Object.freeze({ width: 540, depth: 540, height: 960 }),
  gamingChair: Object.freeze({ width: 620, depth: 620, height: 1300 }),
  rug: Object.freeze({ width: 2000, depth: 1400, height: 10, underlay: true }),
  floorLamp: Object.freeze({ width: 380, depth: 380, height: 1620 }),
  plant: Object.freeze({ width: 420, depth: 420, height: 1150 }),
});

export const ROTATIONS = Object.freeze([0, 90, 180, 270]);

/**
 * The floor rectangle of a piece at (x, z) with a rotation (degrees). At 0 its front faces +z
 * (into the room from the back wall); 90 faces +x; 180 faces -z; 270 faces -x.
 */
export function footprint(kind, x, z, rotation) {
  const { width, depth } = FURNITURE[kind];
  const across = rotation % 180 === 0;
  const w = across ? width : depth;
  const d = across ? depth : width;
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
}
