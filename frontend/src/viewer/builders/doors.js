// Door panels in front of the carcass (z > 0). Hinged doors span the x-range of the
// compartments they cover; sliding panels split the interior width on two tracks.
// Each door remembers what door motion needs (userData.closed, .hinge or .slide; metres).
// slide.width is the travel: one panel width minus the overlap, so an open panel sits exactly over its neighbour.
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

const SLIDING_OVERLAP = 20; // mm: neighbouring panels overlap so no gap shows [research 14]

function withMotion(mesh, extra) {
  mesh.userData.closed = { position: mesh.position.toArray(), rotationY: 0 };
  Object.assign(mesh.userData, extra);
  return mesh;
}

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const t = VISUAL.doorThickness;
  const gap = VISUAL.doorGap;
  const y = frame.panel + frame.innerHeight / 2;
  const height = frame.innerHeight - 2 * gap;
  const materialOf = (door) => materials.forAppearance(door.appearance ?? doors.appearance);

  if (doors.type === 'hinged') {
    const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
    return doors.items.map((door) => {
      const x0 = rangeOf.get(door.compartmentIds[0])[0];
      const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
      const mesh = box({
        size: [x1 - x0 - 2 * gap, height, t],
        center: [(x0 + x1) / 2, y, t / 2],
        material: materialOf(door),
        userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide },
      });
      const half = toM((x1 - x0 - 2 * gap) / 2);
      const hingeX = mesh.position.x + (door.hingeSide === 'right' ? half : -half);
      return withMotion(mesh, { hinge: { x: hingeX, z: mesh.position.z - toM(t) / 2 } });
    });
  }

  if (doors.type === 'sliding') {
    const n = doors.items.length;
    const panelWidth = (frame.innerWidth + (n - 1) * SLIDING_OVERLAP) / n;
    return doors.items.map((door, i) => withMotion(box({
      size: [panelWidth, height, t],
      center: [frame.panel + i * (panelWidth - SLIDING_OVERLAP) + panelWidth / 2, y, i % 2 === 0 ? t / 2 : t * 1.5 + VISUAL.slidingTrackGap],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door' },
    }), { slide: { index: i, count: n, width: toM(panelWidth - (n > 1 ? SLIDING_OVERLAP : 0)) } }));
  }

  return [];
}
