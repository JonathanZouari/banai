// Interior inserts (schema v2), ported from the P1 prototype: a pull-down rail on two arms, sloped
// shoe shelves, a trouser pull-out and an LED strip with its light. Pure and Node-safe.
// The pull-down and the trouser rack are moving parts (pullOuts.js): the rack slides out, and the
// pull-down rail swings out and down on its arms, as a wardrobe lift does.
// Interior y is measured from the top face of the bottom panel (frame.baseY above the floor); depth
// placement is relative to the shelf line (frame.innerFront), so inserts stay clear of sliding tracks.
// Every part is its own mesh, a direct child of the wardrobe group (picking is not recursive),
// tagged userData { componentId: insert.id, kind: 'insert', compartmentId, insertType }.
// Shoes and trousers on the inserts are decorative clothes (props.js), so they follow the
// clothes toggle. The LED light hangs under its strip mesh, so group.children stays meshes only.
import * as THREE from 'three';
import { SHOE_TIER } from '../../domain/defaults.js';
import { PULL_OUT_SHARE, asMover } from '../pullOuts.js';
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

// ASSUMPTION: visual-only hardware sizes (mm), from P1. Not manufacturing specifications.
export const SHOE_TILT = THREE.MathUtils.degToRad(14); // front edge low (the dossier's 14 degrees)
// The dossier's shoe shelf: 63 mm shallower than the layout's shelf depth, ending 25 mm behind the
// shelf line. Capped so a tilted board always fits its 240 mm tier.
const SHOE_SHALLOWER = 63;
const SHOE_DEPTH_MAX = 520;
const SHOE_BOARD_Y = 100; // board centre above the tier bottom
const SHOE_FRONT_GAP = 25;
// Pull-down (wardrobe lift): two arms stand on pivots low on the compartment walls, the rail across
// their tips. Pulled, the arms swing forward over the top, so the rail comes out of the carcass and
// down in front of it, level all the way. Angles are measured from straight up, + toward the front.
const ARM_LENGTH_MAX = 450;
const ARM_LENGTH_MIN = 40;
const ARM_CLEARANCE = 30; // the pivots stay this far above the surface below the rail
const ARM_LEAN = 0.12; // rad: stowed, the arms lean back a little (the rail sits behind the pivots)
const ARM_SWING = 2.07; // rad: to 1.95 rad (112 degrees) at the bottom of the swing
const PROP_BOTTOM = 20; // mm: the garments on a rail end this far above the surface below (props.js)
const ROD_TILT = 0.12;
const ROD_LENGTH = 420;
const TROUSER_DEPTH_MAX = 500;
const TROUSER_FRONT_GAP = 20;
const TROUSER_BAR_PITCH = 42;
const TROUSER_BARS_MAX = 24;
const LED_SETBACK = 40; // strip centre behind the shelf line (P1)
export const LED_LIGHT_INTENSITY = 9;
export const LED_EMISSIVE_INTENSITY = 2.2;
const LED_ON = 0.02; // below this level the light is switched off (and skipped by the path tracer)

const mesh = (geometry, material, [x, y, z]) => {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(toM(x), toM(y), toM(z));
  return result;
};
const metalBox = (w, h, d, material, center) => mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), material, center);
/** A cylinder along x (rotation z), along z (rotation x) or along y. */
const rod = (radius, length, material, center, axis = 'x', segments = 24) => {
  const geometry = new THREE.CylinderGeometry(toM(radius), toM(radius), toM(length), segments);
  if (axis === 'x') geometry.rotateZ(Math.PI / 2);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  return mesh(geometry, material, center);
};

/** Highest top (interior y) of the shelves, drawers and zone inserts that end at or below y (0 = the base). */
function floorBelow(compartment, y) {
  const tops = [
    ...compartment.shelves.map((s) => s.y + s.thickness),
    ...compartment.drawers.map((d) => d.y + d.height),
    ...(compartment.inserts ?? []).filter((insert) => insert.type === 'shoes' || insert.type === 'trousers').map((insert) => insertZone(insert)[1]),
  ];
  return Math.max(0, ...tops.filter((top) => top <= y));
}

/** The interior y-range an insert occupies ([y, y] for a pull-down), or null (LED). Mirrors docs/schema.md v2. */
export function insertZone(insert) {
  if (insert.type === 'shoes') return [insert.y, insert.y + insert.tiers * SHOE_TIER];
  if (insert.type === 'trousers') return [insert.y, insert.y + insert.height];
  if (insert.type === 'pulldown') return [insert.y, insert.y];
  return null;
}

/**
 * The pull-down's linkage (mm, y above the floor): arm `length`, `pivot` { y, z }, swing angles `from`
 * (stowed) and `to` (lowered), and the rail at angle theta: at(theta) = { y, z }. `floor` is the interior y
 * of the surface below the rail. The arms fit above that surface, and the swing stops early when the
 * garments hanging from the rail would otherwise reach the floor.
 */
export function pulldownLinkage(frame, compartment, insert) {
  const floor = floorBelow(compartment, insert.y);
  const length = Math.max(ARM_LENGTH_MIN, Math.min(ARM_LENGTH_MAX, insert.y - floor - ARM_CLEARANCE));
  const from = -ARM_LEAN;
  const rail = { y: frame.baseY + insert.y, z: frame.innerCenterZ };
  const pivot = { y: rail.y - length * Math.cos(from), z: rail.z - length * Math.sin(from) };
  // The lowest garment ends PROP_BOTTOM over the surface below; lowered, it must stay over the floor.
  const maxDrop = frame.baseY + floor;
  const lowest = Math.cos(from) - maxDrop / length;
  const to = Math.min(from + ARM_SWING, lowest <= -1 ? Math.PI : Math.acos(Math.min(1, lowest)));
  const at = (theta) => ({ y: pivot.y + length * Math.cos(theta), z: pivot.z + length * Math.sin(theta) });
  return { length, pivot, from, to, floor, at };
}

/** Interior y (mm) down to which the garments on a pull-down reach once it is lowered. */
export function pulldownReach(frame, compartment, insert) {
  const { from, to, floor, at } = pulldownLinkage(frame, compartment, insert);
  return floor + PROP_BOTTOM - (at(from).y - at(to).y);
}

// Pull-down rail (wardrobe lift), built stowed: the rail across the tips of two arms that stand on
// pivots low on the side walls, and a pull rod with a hook hanging in front. The arms swing, and the
// rail, rod and hook ride on their tips (pullOuts.js).
function pulldown(insert, { frame, compartment, x0, x1, materials }) {
  const cx = (x0 + x1) / 2;
  const y = frame.baseY + insert.y;
  const z = frame.innerCenterZ;
  const linkage = pulldownLinkage(frame, compartment, insert);
  const { length, pivot, from, to } = linkage;
  const swing = { pivot: [toM(pivot.y), toM(pivot.z)], length: toM(length), from, to };
  const carried = { type: 'carried', ...swing };
  const parts = [asMover(rod(VISUAL.railRadius, Math.max(x1 - x0 - 60, 20), materials.chrome, [cx, y, z]), carried)];
  for (const ax of [x0 + 14, x1 - 14]) {
    const arm = metalBox(8, length, 40, materials.metal,
      [ax, pivot.y + (length / 2) * Math.cos(from), pivot.z + (length / 2) * Math.sin(from)]);
    arm.rotation.x = from; // the box's long axis (y) runs along the arm
    parts.push(asMover(arm, { type: 'arm', ...swing }));
  }
  const rodLength = Math.min(ROD_LENGTH, insert.y - linkage.floor - 60);
  if (rodLength >= 100) {
    const top = y - 10;
    const pull = rod(4.5, rodLength, materials.metal, [cx, top - (rodLength / 2) * Math.cos(ROD_TILT), z + 40 + (rodLength / 2) * Math.sin(ROD_TILT)], 'y', 16);
    pull.rotation.x = -ROD_TILT; // the lower end leans toward the front, where it is grabbed
    const hook = mesh(new THREE.TorusGeometry(toM(12), toM(3), 16, 24, Math.PI), materials.metal,
      [cx, top - rodLength * Math.cos(ROD_TILT) - 12, z + 40 + rodLength * Math.sin(ROD_TILT)]);
    hook.rotation.z = Math.PI; // the open side up: a U under the rod
    parts.push(asMover(pull, carried), asMover(hook, carried));
  }
  return parts;
}

/**
 * Sloped shoe shelf of tier k (mm): centre { yc, zc } of the board before its SHOE_TILT, its depth,
 * and surface(u, lift): the point `lift` above the top face, u along the slope from the centre (+ = front).
 */
export function shoeShelf(frame, insert, k) {
  const depth = Math.max(80, Math.min(frame.shelfDepth - SHOE_SHALLOWER, SHOE_DEPTH_MAX));
  const yc = frame.baseY + insert.y + k * SHOE_TIER + SHOE_BOARD_Y;
  const zc = frame.innerFront - SHOE_FRONT_GAP - depth / 2;
  const [sin, cos] = [Math.sin(SHOE_TILT), Math.cos(SHOE_TILT)];
  const surface = (u, lift = 0) => {
    const v = frame.panel / 2 + lift;
    return { y: yc + v * cos - u * sin, z: zc + v * sin + u * cos };
  };
  return { depth, yc, zc, surface };
}

/** Trouser rack (mm): depth, zc, the bar height `barY` (floor y) and the bars' x positions. */
export function trouserRack(frame, insert, x0, x1) {
  const depth = Math.max(80, Math.min(frame.innerDepth - 60, TROUSER_DEPTH_MAX));
  const span = Math.max(x1 - x0 - 80, 10);
  const bars = Math.min(TROUSER_BARS_MAX, Math.max(4, Math.floor(span / TROUSER_BAR_PITCH)));
  return {
    depth,
    front: frame.innerFront - TROUSER_FRONT_GAP,
    zc: frame.innerFront - TROUSER_FRONT_GAP - depth / 2,
    top: frame.baseY + insert.y + insert.height,
    barY: frame.baseY + insert.y + insert.height - 42,
    barXs: Array.from({ length: bars }, (_, b) => x0 + 40 + ((b + 0.5) * span) / bars),
  };
}

// Sloped shoe shelves, one per 240 mm tier, each with a chrome fence along its low front edge.
function shoes(insert, { frame, x0, x1, materials, board }) {
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;
  return Array.from({ length: insert.tiers }, (_, k) => {
    const { depth, yc, zc, surface } = shoeShelf(frame, insert, k);
    const shelf = box({ size: [width - 2, frame.panel, depth], center: [cx, yc, zc], material: board });
    shelf.rotation.x = SHOE_TILT;
    const edge = surface(depth / 2 - 8, 40); // just behind the low front edge, 40 mm up
    const fence = rod(5, width - 10, materials.chrome, [cx, edge.y, edge.z], 'x', 16);
    return [shelf, fence];
  }).flat();
}

// Pull-out trouser rack at the top of its zone: two runners, a front plate and bars front to back;
// the trousers hang below the bars, down through the zone.
function trousers(insert, { frame, x0, x1, materials }) {
  const { depth, front, zc, top, barY, barXs } = trouserRack(frame, insert, x0, x1);
  const slide = { type: 'slide', travel: toM(PULL_OUT_SHARE * frame.innerDepth) };
  return [
    metalBox(Math.max(x1 - x0 - 40, 20), 35, 16, materials.metal, [(x0 + x1) / 2, top - 30, front - 8]),
    ...[x0 + 16, x1 - 16].map((rx) => metalBox(12, 30, depth, materials.metal, [rx, top - 20, zc])),
    ...barXs.map((bx) => rod(5, depth, materials.chrome, [bx, barY, zc], 'z', 12)),
  ].map((part) => asMover(part, slide));
}

// LED strip under the compartment top, near the front, with a downward area light. Like a door
// sensor, it lights up as the doors open (see ledLevel / setLedLevel).
function led(insert, { frame, x0, x1, materials }) {
  const width = x1 - x0;
  const strip = metalBox(Math.max(width - 40, 10), 8, 14, materials.led,
    [(x0 + x1) / 2, frame.baseY + frame.innerHeight - 6, frame.innerFront - LED_SETBACK]);
  const light = new THREE.RectAreaLight('#ffd9ad', 0, toM(Math.max(width - 60, 10)), toM(30));
  light.position.y = toM(-8);
  light.rotation.x = -Math.PI / 2; // emit along -z of the light = straight down
  light.visible = false;
  light.userData = { led: true };
  strip.add(light);
  return [strip];
}

const BUILDERS = Object.freeze({ pulldown, shoes, trousers, led });

/** All insert meshes of the design. `materials` needs forAppearance, chrome, metal and led. */
export function buildInserts(design, frame, materials) {
  const board = materials.forAppearance(design.carcass.appearance);
  return design.compartments.flatMap((compartment, ci) => (compartment.inserts ?? []).flatMap((insert) => {
    const build = BUILDERS[insert.type];
    if (!build) return [];
    const [x0, x1] = frame.ranges[ci];
    return build(insert, { frame, compartment, x0, x1, materials, board }).map((part) => {
      // Keep a moving part's motion tags (pullOuts.js).
      part.userData = { ...part.userData, componentId: insert.id, kind: 'insert', compartmentId: compartment.id, insertType: insert.type };
      return part;
    });
  }));
}

/** The LED area lights under the strips of a built group. */
export function ledLightsOf(group) {
  const lights = [];
  group.traverse((object) => { if (object.isRectAreaLight && object.userData.led) lights.push(object); });
  return lights;
}

/**
 * LED level 0..1 for door openness 0..1: off behind closed doors, on as they open. Without doors
 * (type none, no items, or doors hidden in the viewer) the interior is open, so it is always on.
 */
export function ledLevel(design, { doorsVisible = true } = {}, openness = 0) {
  if (design.doors.type === 'none' || !design.doors.items.length || doorsVisible === false) return 1;
  return Math.min(1, Math.max(0, Number.isFinite(openness) ? openness : 0));
}

/** Drive the LED lights and the shared LED material (emissive) to a level 0..1. */
export function setLedLevel(lights, material, level) {
  lights.forEach((light) => {
    light.intensity = LED_LIGHT_INTENSITY * level;
    light.visible = level > LED_ON;
  });
  if (material) material.emissiveIntensity = LED_EMISSIVE_INTENSITY * level;
}
