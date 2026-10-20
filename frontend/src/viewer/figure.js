// Scale figures: the people who live with the wardrobe (design.household.people), each at their own height, in
// matte white beside it like the figures in an architect's model, with a label (name and height). Without a
// household, one 170 cm person. A child's figure shows at once where a top shelf, a drawer or the lock's release
// button sits for them. Shown on request (the "דמות" switch, which turns on when a person is added), never
// picked, and hidden in path-traced renders and in video frames.
// The proportions come from FIGURE_PARTS (mm, for a 170 cm person), which the unit tests check.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CHILD_HEIGHT } from '../domain/defaults.js';
import { cm } from './format.js';
import { toM } from './units.js';

export const FIGURE_HEIGHT = 1700; // mm: the default person, and the height FIGURE_PARTS are drawn at
export const FIGURE_OFFSET = Object.freeze({ x: 450, z: 350 }); // mm right of and in front of the wardrobe
export const FIGURE_SPACING = 550; // mm between people standing in a row

// Each part: a capsule (radius, total height) or the head (a sphere), its centre (x, y) in mm, and a squash in
// depth so the body reads as a figure, not a pile of tubes.
export const FIGURE_PARTS = Object.freeze([
  Object.freeze({ name: 'head', sphere: 105, center: [0, FIGURE_HEIGHT - 105] }),
  Object.freeze({ name: 'torso', radius: 160, height: 560, center: [0, 1170], depth: 0.62 }),
  Object.freeze({ name: 'leftLeg', radius: 70, height: 920, center: [-90, 460], depth: 1 }),
  Object.freeze({ name: 'rightLeg', radius: 70, height: 920, center: [90, 460], depth: 1 }),
  Object.freeze({ name: 'leftArm', radius: 50, height: 610, center: [-228, 1125], depth: 1, tilt: 0.07 }),
  Object.freeze({ name: 'rightArm', radius: 50, height: 610, center: [228, 1125], depth: 1, tilt: -0.07 }),
]);

/** Where the first person stands (mm): right of the wardrobe and a little in front of it. */
export function figurePlacement(design) {
  return { x: design.dimensions.width + FIGURE_OFFSET.x, z: FIGURE_OFFSET.z };
}

/**
 * Where each person stands (mm, the wardrobe's frame): their own place (`at`, ADR-041) or the next one in the row
 * beside the wardrobe. Without a household, the one default person.
 */
export function figureSpots(design) {
  const { x, z } = figurePlacement(design);
  const people = design.household?.people ?? [];
  const count = Math.max(1, people.length);
  return Array.from({ length: count }, (_, i) => {
    const at = people[i]?.at;
    return at ? { x: at[0], z: at[1] } : { x: x + i * FIGURE_SPACING, z };
  });
}

/** The people to draw: the household, or one default person. { height, label } each, label null for the default. */
export function figurePeople(design) {
  const people = design.household?.people ?? [];
  if (!people.length) return [{ height: FIGURE_HEIGHT, label: null, child: false }];
  return people.map((p) => ({
    height: p.height,
    label: p.name ? `${p.name} · ${cm(p.height)} ס״מ` : `${cm(p.height)} ס״מ`,
    child: p.height < CHILD_HEIGHT,
  }));
}

/** The figures: update(design) rebuilds them beside the wardrobe, setVisible(on) shows them, dispose() frees them. */
export function createFigure(scene) {
  const group = new THREE.Group();
  group.name = 'figure';
  group.visible = false;
  const material = new THREE.MeshStandardMaterial({ color: 0xece7df, roughness: 0.92, metalness: 0 });
  const geometries = FIGURE_PARTS.map((part) => (part.sphere
    ? new THREE.SphereGeometry(toM(part.sphere), 24, 16)
    : new THREE.CapsuleGeometry(toM(part.radius), toM(part.height - 2 * part.radius), 8, 16)));
  let labels = [];
  let key = null;
  scene.add(group);

  const clear = () => {
    group.children.slice().forEach((child) => group.remove(child));
    labels.forEach((label) => label.element.remove());
    labels = [];
  };

  function person({ height, label, child }, index, spot, owned) {
    const body = new THREE.Group();
    body.name = 'person';
    const scale = height / FIGURE_HEIGHT;
    FIGURE_PARTS.forEach((part, i) => {
      const mesh = new THREE.Mesh(geometries[i], material);
      mesh.name = part.name;
      mesh.position.set(toM(part.center[0]), toM(part.center[1]), 0);
      if (part.depth && part.depth !== 1) mesh.scale.z = part.depth;
      if (part.tilt) mesh.rotation.z = part.tilt;
      if (child && part.sphere) { // a child's head is larger for their height: grow it, keeping its top
        mesh.scale.setScalar(1.25);
        mesh.position.y = toM(part.center[1] - part.sphere * 0.25);
      }
      mesh.castShadow = true;
      mesh.raycast = () => {}; // never picked
      body.add(mesh);
    });
    body.scale.setScalar(scale);
    body.position.set(toM(spot.x), 0, toM(spot.z));
    body.userData.personIndex = owned ? index : -1; // -1: the default person, not in the household yet
    if (label && typeof document !== 'undefined') {
      const element = document.createElement('div');
      element.className = 'figure-label';
      element.textContent = label; // text only, never HTML
      element.dir = 'auto';
      const tag = new CSS2DObject(element);
      tag.position.set(0, toM((height + 120) / scale), 0); // on the person (their scale undone), so it goes with a drag
      tag.visible = group.visible;
      labels.push(tag);
      body.add(tag);
    }
    return body;
  }

  return {
    group,
    update(design) {
      group.position.set(0, 0, 0);
      const people = figurePeople(design);
      const spots = figureSpots(design);
      const next = JSON.stringify([people, spots]);
      if (next === key) return;
      key = next;
      clear();
      const owned = (design.household?.people ?? []).length > 0;
      people.forEach((p, i) => group.add(person(p, i, spots[i], owned)));
    },
    setVisible(on) {
      group.visible = Boolean(on);
      labels.forEach((label) => { label.visible = group.visible; });
    },
    /** How far right (mm, from the wardrobe's left face) the figures reach, and the tallest one's height. */
    extent(design) {
      const people = figurePeople(design);
      const right = Math.max(...figureSpots(design).map((s) => s.x));
      return { right: right + 300, height: Math.max(...people.map((p) => p.height)) + 200 };
    },
    get count() {
      return group.children.filter((child) => child.name === 'person').length;
    },
    dispose() {
      clear();
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      scene.remove(group);
    },
  };
}
