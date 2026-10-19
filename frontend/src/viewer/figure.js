// A scale figure: a 170 cm person in matte white beside the wardrobe, like the figure in an architect's model,
// so the wardrobe's size reads at a glance (a top shelf above the head, a rail at shoulder height). Shown on
// request (the "דמות" switch), never picked, and hidden in path-traced renders and in video frames.
// The proportions come from FIGURE_PARTS (mm), which the unit tests check against FIGURE_HEIGHT.
import * as THREE from 'three';
import { toM } from './units.js';

export const FIGURE_HEIGHT = 1700; // mm: a configurable default, not a design value
export const FIGURE_OFFSET = Object.freeze({ x: 450, z: 350 }); // mm right of and in front of the wardrobe

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

/** Where the figure stands (mm): right of the wardrobe and a little in front of it. */
export function figurePlacement(design) {
  return { x: design.dimensions.width + FIGURE_OFFSET.x, z: FIGURE_OFFSET.z };
}

/** The figure: update(design) moves it beside the wardrobe, setVisible(on) shows it, dispose() frees it. */
export function createFigure(scene) {
  const group = new THREE.Group();
  group.name = 'figure';
  group.visible = false;
  const material = new THREE.MeshStandardMaterial({ color: 0xece7df, roughness: 0.92, metalness: 0 });
  FIGURE_PARTS.forEach((part) => {
    const geometry = part.sphere
      ? new THREE.SphereGeometry(toM(part.sphere), 24, 16)
      : new THREE.CapsuleGeometry(toM(part.radius), toM(part.height - 2 * part.radius), 8, 16);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    mesh.position.set(toM(part.center[0]), toM(part.center[1]), 0);
    if (part.depth && part.depth !== 1) mesh.scale.z = part.depth;
    if (part.tilt) mesh.rotation.z = part.tilt;
    mesh.castShadow = true;
    mesh.raycast = () => {}; // never picked
    group.add(mesh);
  });
  scene.add(group);

  return {
    group,
    update(design) {
      const { x, z } = figurePlacement(design);
      group.position.set(toM(x), 0, toM(z));
    },
    setVisible(on) {
      group.visible = Boolean(on);
    },
    dispose() {
      group.children.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
      scene.remove(group);
    },
  };
}
