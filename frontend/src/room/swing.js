// Where the wardrobe's doors need floor space: a visual aid only, never a rule or a warning.
// Hinged doors sweep a quarter circle from their hinge (radius = the door leaf's width); sliding
// doors need only their track band. The door leaves match the viewer's builder exactly. Pure, mm.
import { compartmentXRanges } from '../domain/geometry.js';
import { VISUAL } from '../viewer/units.js';

const ARC_STEPS = 16;
const SLIDING_BAND = 30; // mm shown in front of the sliding doors' front track

/**
 * The floor area each door needs: hinged doors as { type: 'hinged', doorId, hinge, radius,
 * polygon } (a convex quarter-circle fan, hinge first), sliding doors as { type: 'sliding', rect }.
 */
export function doorSwings(design) {
  const { doors, carcass, dimensions } = design;
  const panel = carcass.panelThickness;
  const t = VISUAL.doorThickness;
  if (doors.type === 'sliding') {
    const front = t * 1.5 + VISUAL.slidingTrackGap + t / 2;
    return [{ type: 'sliding', rect: { x0: panel, x1: dimensions.width - panel, z0: 0, z1: front + SLIDING_BAND } }];
  }
  if (doors.type !== 'hinged') return [];
  const ranges = new Map(design.compartments.map((c, i) => [c.id, compartmentXRanges(design)[i].map((x) => x + panel)]));
  return doors.items.map((door) => {
    const x0 = ranges.get(door.compartmentIds[0])[0] + VISUAL.doorGap;
    const x1 = ranges.get(door.compartmentIds.at(-1))[1] - VISUAL.doorGap;
    const radius = x1 - x0;
    const hinge = { x: door.hingeSide === 'left' ? x0 : x1, z: t };
    // From the closed leaf (along the front, toward the free edge) to fully open (straight out).
    const closed = door.hingeSide === 'left' ? 0 : Math.PI;
    const arc = Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
      const angle = closed + (door.hingeSide === 'left' ? 1 : -1) * (i / ARC_STEPS) * (Math.PI / 2);
      return { x: hinge.x + Math.cos(angle) * radius, z: hinge.z + Math.sin(angle) * radius };
    });
    return { type: 'hinged', doorId: door.id, hinge, radius, polygon: [hinge, ...arc] };
  });
}

const rectPolygon = ({ x0, x1, z0, z1 }) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

/** Separating-axis test for two convex polygons on the floor. Touching is not overlapping. */
function convexOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const axis = { x: q.z - p.z, z: p.x - q.x };
      if (axis.x === 0 && axis.z === 0) continue;
      const project = (points) => points.map((v) => v.x * axis.x + v.z * axis.z);
      const [pa, pb] = [project(a), project(b)];
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Does a piece's floor rectangle stand where a door needs to open? */
export function inTheWay(swing, rect) {
  return convexOverlap(swing.type === 'hinged' ? swing.polygon : rectPolygon(swing.rect), rectPolygon(rect));
}
