// Dimension indicators: overall W/H/D lines with labels, plus a label for the selected
// component. Labels are CSS2D DOM nodes written with textContent only (never HTML).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { interiorHeight } from '../domain/geometry.js';
import { locate } from '../domain/lookup.js';
import { ITEM_KINDS } from '../domain/util.js';
import { frameOf } from './builders/frame.js';
import { cm, describeSelection } from './format.js';
import { toM } from './units.js';

const OFFSET = 80; // mm, distance of dimension lines from the carcass (visual only)

function label(text, className) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

/**
 * Vertical extent of a measurable part, in interior mm (y = 0 on the bottom panel's top face),
 * read from the design only (never from meshes). `target` is { id, part } from a pick.
 * Shelves, drawers and rails, plus the carcass top and bottom panels; anything else is null.
 */
export function verticalExtent(design, { id, part }) {
  if (id === 'carcass') {
    const t = design.carcass.panelThickness;
    const h = interiorHeight(design);
    if (part === 'bottom') return { bottom: -t, top: 0, compartment: null };
    if (part === 'top') return { bottom: h, top: h + t, compartment: null };
    return null;
  }
  const found = locate(design, id);
  if (!found || !ITEM_KINDS.includes(found[0])) return null;
  const [kind, ci, ii] = found;
  const item = design.compartments[ci][kind][ii];
  const size = { shelves: item.thickness, drawers: item.height, rails: 0 }[kind];
  return { bottom: item.y, top: item.y + size, compartment: ci };
}

/** Clear vertical gap in mm between two extents (0 when they overlap). Pure. */
export function verticalGap(a, b) {
  const [lower, upper] = a.bottom <= b.bottom ? [a, b] : [b, a];
  return Math.max(upper.bottom - lower.top, 0);
}

export function createDimensions(scene) {
  const layer = new THREE.Group();
  layer.name = 'dimensions';
  scene.add(layer);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#5b6470' });
  // The measurement has its own layer so selection updates don't wipe it.
  const measureLayer = new THREE.Group();
  measureLayer.name = 'measure';
  scene.add(measureLayer);
  const measureMaterial = new THREE.LineBasicMaterial({ color: '#b4532a' });
  const clearMeasure = () => {
    measureLayer.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.element) child.element.remove();
    });
    measureLayer.clear();
  };

  const line = (from, to) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to].map(([x, y, z]) => new THREE.Vector3(toM(x), toM(y), toM(z))));
    layer.add(new THREE.Line(geometry, lineMaterial));
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

  return {
    update(group, design, selection) {
      clear();
      const { width: w, height: h, depth: d } = design.dimensions;
      line([0, h + OFFSET, 0], [w, h + OFFSET, 0]);
      place(label(`W ${cm(w)} cm`, 'dim-label'), [w / 2, h + OFFSET, 0]);
      line([-OFFSET, 0, 0], [-OFFSET, h, 0]);
      place(label(`H ${cm(h)} cm`, 'dim-label'), [-OFFSET, h / 2, 0]);
      line([w + OFFSET, 0, 0], [w + OFFSET, 0, -d]);
      place(label(`D ${cm(d)} cm`, 'dim-label'), [w + OFFSET, 0, -d / 2]);

      if (!selection || !group) return;
      const target = group.children.find((mesh) => mesh.userData.componentId === selection.id);
      const anchor = target ? target.position : new THREE.Vector3(toM(w / 2), toM(h / 2), 0);
      const selected = label(describeSelection(design, selection), 'dim-label dim-label--selected');
      selected.position.copy(anchor);
      selected.center.set(0.5, 1.6); // sit above the component instead of covering it
      layer.add(selected);
    },
    /** Draw the vertical gap between two extents (from the design) as a line with a label. */
    showMeasure(design, a, b) {
      clearMeasure();
      const frame = frameOf(design);
      const [lower, upper] = a.bottom <= b.bottom ? [a, b] : [b, a];
      const ci = a.compartment ?? b.compartment;
      const x = ci === null ? frame.width / 2 : (frame.ranges[ci][0] + frame.ranges[ci][1]) / 2;
      const from = frame.panel + Math.min(lower.top, upper.bottom);
      const to = frame.panel + Math.max(lower.top, upper.bottom);
      const z = 30; // mm in front of the carcass so the line stays visible (visual only)
      const points = [[x, from, z], [x, to, z]].map(([px, py, pz]) => new THREE.Vector3(toM(px), toM(py), toM(pz)));
      measureLayer.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), measureMaterial));
      const text = label(`${cm(verticalGap(a, b))} cm`, 'dim-label dim-label--measure');
      text.position.set(toM(x), toM((from + to) / 2), toM(z));
      measureLayer.add(text);
    },
    clearMeasure,
    dispose() {
      clear();
      clearMeasure();
      measureMaterial.dispose();
      lineMaterial.dispose();
    },
  };
}
