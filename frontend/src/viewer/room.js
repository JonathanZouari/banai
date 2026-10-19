// The room around the wardrobe, drawn in pencil from the customer's site measurements (schema v2 `site`):
// - on the floor: each hinged leaf's swing (a quarter circle as wide as the leaf), each drawer's pull-out
//   zone, and the free floor in front of the wardrobe as a dashed line with its label;
// - in the front plane: the niche walls and the ceiling through the readings the customer took (widths at
//   three heights, the ceiling at three points), so an out-of-square niche shows as a slanted line;
// - also in the front plane, dashed like hidden lines on a drawing: what is on the wall behind (sockets,
//   switches, an AC unit, pipes, a window, skirting), each with its name; one the carcass covers that it
//   cannot simply cut around (AC, pipes, a window) in the warning colour (it is advisory R23).
// A swing or a pull-out that crosses the room's line is drawn in the warning colour (it is advisory R21).
// Visual only: never picked, hidden in the path-traced render and in video frames. The geometry comes from
// pure functions (mm in, mm out) that are unit-tested; the reach estimate is the same as advice R21's.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { doorRects } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { cm } from './format.js';
import { buildObstacles } from './obstacles3d.js';
import { VISUAL, toM } from './units.js';

const FLOOR_Y = 1.5; // mm above the floor, over the grid and the shadow
const FRONT_Z = 2; // mm in front of the carcass face, for the niche drawing
const ARC_STEPS = 24;
const WALL_OVERHANG = 150; // mm the ceiling line runs past the carcass when there is no niche
export const ROOM_COLORS = Object.freeze({ pencil: 0x8a7f73, warn: 0xc2410c, room: 0x5c544b });

/** How far a drawer on full-extension runners comes out past the carcass front (mm); advice R21's estimate. */
export function drawerReach(frame) {
  return Math.max(0, frame.shelfDepth - (frame.depth - frame.shelfDepth)); // as advice R21: never negative
}

/** Each hinged leaf's swing on the floor: { id, points: [[x, z]...] (mm), radius, blocked }. */
export function doorSwings(design, frame = frameOf(design)) {
  if (design.doors.type !== 'hinged') return [];
  const room = design.site?.clearance ?? null;
  const z0 = VISUAL.doorThickness;
  return doorRects(design, frame).map(({ door, x0, width }) => {
    const right = door.hingeSide === 'right';
    const hingeX = right ? x0 + width : x0;
    const points = [];
    for (let i = 0; i <= ARC_STEPS; i += 1) {
      const angle = (i / ARC_STEPS) * (Math.PI / 2);
      points.push([hingeX + (right ? -1 : 1) * width * Math.cos(angle), z0 + width * Math.sin(angle)]);
    }
    // The open leaf itself, from the hinge out to the floor's arc end.
    points.push([hingeX, z0]);
    return { id: door.id, points, radius: width, blocked: room !== null && width > room };
  });
}

/** Each drawer compartment's pull-out zone on the floor: { index, x0, x1, reach, blocked } (mm). */
export function drawerZones(design, frame = frameOf(design)) {
  const room = design.site?.clearance ?? null;
  const reach = drawerReach(frame);
  return design.compartments.flatMap((compartment, index) => (compartment.drawers.length
    ? [{ index, x0: frame.ranges[index][0], x1: frame.ranges[index][1], reach, blocked: room !== null && reach > room }]
    : []));
}

/** The room's line in front of the wardrobe: { z, x0, x1, label } (mm), or null without a clearance. */
export function clearanceLine(design, frame = frameOf(design)) {
  const room = design.site?.clearance ?? null;
  if (room === null) return null;
  return { z: room, x0: -300, x1: frame.width + 300, label: `מרחב פנוי ${cm(room)} ס״מ` };
}

/**
 * The niche in the front plane, through the customer's readings: { walls: [[[x, y]...], [[x, y]...]],
 * ceiling: [[x, y]...] } (mm, either part may be empty). Widths are read at the top, middle and bottom of
 * the wall and centred on the wardrobe; heights at the left, middle and right. A single value is a straight line.
 */
export function nicheOutline(design, frame = frameOf(design)) {
  const site = design.site ?? {};
  const W = frame.width;
  const top = site.ceiling ?? frame.height + 200;
  const levels = [top - 100, top / 2, 100]; // where widths are read: top, middle, bottom
  let wallReadings = [];
  if (site.widths) wallReadings = site.widths.map((w, i) => (w === null ? null : [w, levels[i]])).filter(Boolean);
  else if (site.niche) wallReadings = [[site.niche, top], [site.niche, 0]];
  if (wallReadings.length === 1) wallReadings = [[wallReadings[0][0], top], [wallReadings[0][0], 0]];
  const walls = wallReadings.length
    ? [wallReadings.map(([w, y]) => [(W - w) / 2, y]), wallReadings.map(([w, y]) => [(W + w) / 2, y])]
    : [];
  const left = walls.length ? Math.min(...walls[0].map(([x]) => x)) : -WALL_OVERHANG;
  const rightX = walls.length ? Math.max(...walls[1].map(([x]) => x)) : W + WALL_OVERHANG;
  const xs = [left, W / 2, rightX]; // where heights are read: left, middle, right
  let ceiling = [];
  if (site.heights) ceiling = site.heights.map((h, i) => (h === null ? null : [xs[i], h])).filter(Boolean);
  else if (site.ceiling) ceiling = [[left, site.ceiling], [rightX, site.ceiling]];
  if (ceiling.length === 1) ceiling = [[left, ceiling[0][1]], [rightX, ceiling[0][1]]];
  return { walls, ceiling };
}

function line(points, color, { dashed = false } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.95 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const object = new THREE.Line(geometry, material);
  if (dashed) object.computeLineDistances();
  object.raycast = () => {}; // never picked
  object.renderOrder = 2;
  return object;
}

const onFloor = ([x, z]) => new THREE.Vector3(toM(x), toM(FLOOR_Y), toM(z));
const onFront = ([x, y]) => new THREE.Vector3(toM(x), toM(y), toM(FRONT_Z));
// Obstacles are drawn over the doors (the leaves stand doorThickness proud of the carcass), like hidden lines.
const overDoors = ([x, y]) => new THREE.Vector3(toM(x), toM(y), toM(VISUAL.doorThickness + 4));

export const OBSTACLE_NAMES = Object.freeze({ socket: 'שקע', switch: 'מתג', ac: 'מזגן', pipe: 'צנרת', window: 'חלון', panel: 'פנל' });
const BLOCKING = new Set(['ac', 'pipe', 'window']);

/**
 * The wall obstacles in the front plane (mm): { type, name, corners (a closed outline), center, behind,
 * blocking }. `behind` is R23's test: the obstacle overlaps the carcass [0, W] x [0, H].
 */
export function obstacleOutlines(design, frame = frameOf(design)) {
  return (design.site?.obstacles ?? []).filter(({ type }) => Object.hasOwn(OBSTACLE_NAMES, type)).map(({ type, x, y, width, height }) => {
    const behind = x < frame.width && x + width > 0 && y < frame.height;
    return {
      type, name: OBSTACLE_NAMES[type],
      corners: [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]],
      center: [x + width / 2, y + height / 2],
      behind, blocking: behind && BLOCKING.has(type),
    };
  });
}

/** The overlay: update(design) redraws it, setVisible(on) shows or hides it, dispose() frees it. */
export function createRoomOverlay(scene) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);
  const labels = [];
  let visible = true;

  const clear = () => {
    group.children.slice().forEach((child) => {
      group.remove(child);
      if (child.userData.dispose) child.userData.dispose(); // the obstacles' group frees its own parts
      child.geometry?.dispose();
      child.material?.dispose();
    });
    labels.splice(0).forEach((label) => label.element.remove());
  };
  const addLabel = (text, position, className = 'room-label') => {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text; // text only, never HTML
    element.dir = 'auto';
    const label = new CSS2DObject(element);
    label.position.copy(position);
    label.visible = visible;
    labels.push(label);
    group.add(label);
  };

  return {
    group,
    update(design) {
      clear();
      if (!design.site) return;
      const frame = frameOf(design);
      const room = clearanceLine(design, frame);
      if (room) {
        group.add(line([[room.x0, room.z], [room.x1, room.z]].map(onFloor), ROOM_COLORS.room, { dashed: true }));
        addLabel(room.label, onFloor([room.x1 - 250, room.z + 60]));
        doorSwings(design, frame).forEach((swing) => {
          group.add(line(swing.points.map(onFloor), swing.blocked ? ROOM_COLORS.warn : ROOM_COLORS.pencil));
        });
        drawerZones(design, frame).forEach(({ x0, x1, reach, blocked }) => {
          const z0 = VISUAL.doorThickness;
          const corners = [[x0, z0], [x0, z0 + reach], [x1, z0 + reach], [x1, z0]];
          group.add(line(corners.map(onFloor), blocked ? ROOM_COLORS.warn : ROOM_COLORS.pencil, { dashed: true }));
        });
      }
      const { walls, ceiling } = nicheOutline(design, frame);
      walls.forEach((wall) => group.add(line(wall.map(onFront), ROOM_COLORS.room)));
      if (ceiling.length) group.add(line(ceiling.map(onFront), ROOM_COLORS.room));
      // The obstacles at their real size on the wall; one hidden behind the carcass also shows over the doors,
      // x-ray style: a tinted patch and its outline, red when it blocks (R23).
      const models = buildObstacles(design, frame.depth);
      if (models) group.add(models);
      obstacleOutlines(design, frame).forEach((o) => {
        const color = o.blocking ? ROOM_COLORS.warn : ROOM_COLORS.room;
        const [[x0, y0], , [x1, y1]] = o.corners;
        if (o.behind) {
          const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(toM(x1 - x0), toM(y1 - y0)),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }),
          );
          patch.position.copy(overDoors(o.center));
          patch.raycast = () => {};
          patch.renderOrder = 2;
          group.add(patch);
          group.add(line(o.corners.map(overDoors), color));
        }
        const size = `${Math.round((x1 - x0) / 10)}×${Math.round((y1 - y0) / 10)}`;
        const onWall = new THREE.Vector3(toM(o.center[0]), toM(y1 + 60), toM(-frame.depth + 40));
        addLabel(`${o.name} · ${size}`, o.behind ? overDoors(o.center) : onWall, 'room-label room-label--small');
      });
    },
    setVisible(on) {
      visible = on;
      group.visible = on;
      labels.forEach((label) => { label.visible = on; });
    },
    dispose() {
      clear();
      scene.remove(group);
    },
  };
}
