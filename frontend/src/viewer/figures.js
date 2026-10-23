// Household figures: each person at their own height, in matte white beside the wardrobe like the
// figures in an architect's model, with a label (name and height). Never picked. A child's figure
// shows at once which drawers and shelves are within reach.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { isChild } from '../household/household.js';
import { toM } from './units.js';

export const FIGURE_HEIGHT = 1700; // mm: the height FIGURE_PARTS are drawn at
export const FIGURE_OFFSET = Object.freeze({ x: 450, z: 350 }); // mm right of and in front of the wardrobe
export const FIGURE_SPACING = 550; // mm between people standing in a row

export const FIGURE_PARTS = Object.freeze([
  Object.freeze({ name: 'head', sphere: 105, center: [0, FIGURE_HEIGHT - 105] }),
  Object.freeze({ name: 'torso', radius: 160, height: 560, center: [0, 1170], depth: 0.62 }),
  Object.freeze({ name: 'leftLeg', radius: 70, height: 920, center: [-90, 460] }),
  Object.freeze({ name: 'rightLeg', radius: 70, height: 920, center: [90, 460] }),
  Object.freeze({ name: 'leftArm', radius: 50, height: 610, center: [-228, 1125], tilt: 0.07 }),
  Object.freeze({ name: 'rightArm', radius: 50, height: 610, center: [228, 1125], tilt: -0.07 }),
]);

/** Where person `index` stands (mm, the wardrobe's frame): in a row to the right, a little in front. */
export const figureSpot = (design, index) => ({ x: design.dimensions.width + FIGURE_OFFSET.x + index * FIGURE_SPACING, z: FIGURE_OFFSET.z });

const label = (person, index) => `${person.name || `אדם ${index + 1}`} · ${(person.height / 10).toFixed(0)} ס״מ`;

export function createFigures(scene) {
  const group = new THREE.Group();
  group.name = 'household';
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({ color: 0xece7df, roughness: 0.92, metalness: 0 });
  const geometries = FIGURE_PARTS.map((part) => (part.sphere
    ? new THREE.SphereGeometry(toM(part.sphere), 24, 16)
    : new THREE.CapsuleGeometry(toM(part.radius), toM(part.height - 2 * part.radius), 8, 16)));
  let key = null;

  const clear = () => {
    group.children.slice().forEach((body) => {
      body.traverse((node) => node.element?.remove());
      group.remove(body);
    });
  };

  function person(p, index, design) {
    const body = new THREE.Group();
    body.name = 'person';
    const child = isChild(p);
    FIGURE_PARTS.forEach((part, i) => {
      const mesh = new THREE.Mesh(geometries[i], material);
      mesh.position.set(toM(part.center[0]), toM(part.center[1]), 0);
      if (part.depth) mesh.scale.z = part.depth;
      if (part.tilt) mesh.rotation.z = part.tilt;
      if (child && part.sphere) { // a child's head is larger for their height: grow it, keeping its top
        mesh.scale.setScalar(1.25);
        mesh.position.y = toM(part.center[1] - part.sphere * 0.25);
      }
      mesh.raycast = () => {}; // never picked
      body.add(mesh);
    });
    const scale = p.height / FIGURE_HEIGHT;
    const spot = figureSpot(design, index);
    body.scale.setScalar(scale);
    body.position.set(toM(spot.x), 0, toM(spot.z));
    const element = document.createElement('div');
    element.className = `figure-label${child ? ' figure-label--child' : ''}`;
    element.textContent = label(p, index); // text only, never HTML
    element.dir = 'auto';
    const tag = new CSS2DObject(element);
    tag.position.set(0, toM((p.height + 120) / scale), 0);
    body.add(tag);
    return body;
  }

  return {
    update(design, people) {
      const next = JSON.stringify([design.dimensions.width, people]);
      if (next === key) return;
      key = next;
      clear();
      people.forEach((p, i) => group.add(person(p, i, design)));
    },
    /** The right edge (mm) the camera must include: the last person, or the wardrobe alone. */
    rightEdge: (design, people) => (people.length ? figureSpot(design, people.length - 1).x + 300 : design.dimensions.width),
    get count() {
      return group.children.length;
    },
    dispose() {
      clear();
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    },
  };
}
