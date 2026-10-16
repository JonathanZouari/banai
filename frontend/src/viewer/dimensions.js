// Dimension indicators. With nothing selected: overall W/H/D. With a selection: only the
// measurements relevant to it (a section's width, an item's height above the section
// floor) plus a name tag. Labels are CSS2D DOM nodes written with textContent only.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { describeSelection } from '../ui/naming.js';
import { frameOf } from './builders/frame.js';
import { cm } from './format.js';
import { toM } from './units.js';

const OFFSET = 80; // mm, distance of dimension lines from the carcass (visual only)
const ITEM_LINE_INSET = 60; // mm from the section's left side (visual only)

function label(text, className) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

/** The item record and its section index for a shelf / drawer / rail id. */
function findItem(design, id) {
  for (const [index, compartment] of design.compartments.entries()) {
    const item = [...compartment.shelves, ...compartment.drawers, ...compartment.rails].find((i) => i.id === id);
    if (item) return { item, index };
  }
  return null;
}

export function createDimensions(scene) {
  const layer = new THREE.Group();
  layer.name = 'dimensions';
  scene.add(layer);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#5b6470' });
  const accentMaterial = new THREE.LineBasicMaterial({ color: '#2f6fed', depthTest: false, transparent: true });

  const line = (from, to, material = lineMaterial) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to].map(([x, y, z]) => new THREE.Vector3(toM(x), toM(y), toM(z))));
    const object = new THREE.Line(geometry, material);
    object.renderOrder = 11;
    layer.add(object);
  };

  const place = (object, [x, y, z]) => {
    object.position.set(toM(x), toM(y), toM(z));
    layer.add(object);
  };

  const clear = () => {
    layer.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.element) child.element.remove();
    });
    layer.clear();
  };

  const overall = (design) => {
    const { width: w, height: h, depth: d } = design.dimensions;
    line([0, h + OFFSET, 0], [w, h + OFFSET, 0]);
    place(label(`W ${cm(w)} cm`, 'dim-label'), [w / 2, h + OFFSET, 0]);
    line([-OFFSET, 0, 0], [-OFFSET, h, 0]);
    place(label(`H ${cm(h)} cm`, 'dim-label'), [-OFFSET, h / 2, 0]);
    line([w + OFFSET, 0, 0], [w + OFFSET, 0, -d]);
    place(label(`D ${cm(d)} cm`, 'dim-label'), [w + OFFSET, 0, -d / 2]);
  };

  const forSelection = (design, selection) => {
    const frame = frameOf(design);
    if (selection.kind === 'carcass') {
      overall(design);
      return;
    }
    if (selection.kind === 'compartment') {
      const index = design.compartments.findIndex((c) => c.id === selection.id);
      if (index < 0) return;
      const [x0, x1] = frame.ranges[index];
      const y = frame.height + OFFSET;
      line([x0, y, 0], [x1, y, 0], accentMaterial);
      place(label(`${cm(x1 - x0)} cm`, 'dim-label dim-label--accent'), [(x0 + x1) / 2, y, 0]);
      return;
    }
    const found = findItem(design, selection.id);
    if (!found) return;
    const x = frame.ranges[found.index][0] + ITEM_LINE_INSET;
    const z = frame.innerCenterZ + frame.innerDepth / 2;
    line([x, frame.panel, z], [x, frame.panel + found.item.y, z], accentMaterial);
    if (found.item.y > 0) place(label(`${cm(found.item.y)} cm`, 'dim-label dim-label--accent'), [x, frame.panel + found.item.y / 2, z]);
  };

  return {
    update(group, design, selection, { visible = true } = {}) {
      clear();
      if (!visible) return;
      if (!selection) {
        overall(design);
        return;
      }
      forSelection(design, selection);
      if (!group) return;
      const target = group.children.find((mesh) => mesh.userData.componentId === selection.id);
      const { width: w, height: h } = design.dimensions;
      const anchor = target ? target.position : new THREE.Vector3(toM(w / 2), toM(h / 2), 0);
      const selected = label(describeSelection(design, selection), 'dim-label dim-label--selected');
      selected.position.copy(anchor);
      selected.center.set(0.5, 1.6); // sit above the component instead of covering it
      layer.add(selected);
    },
    dispose() {
      clear();
      lineMaterial.dispose();
      accentMaterial.dispose();
    },
  };
}
