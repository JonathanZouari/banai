// Selection feedback: an always-on-top outline around the selected component.
// Compartments have no mesh of their own, so their interior volume is outlined.
// With { fill: true } the parts are also tinted in the accent colour: the proposal card's preview
// of the parts a change affects. WebGL lines are always 1 px, so the tint is what makes it visible.
// It never touches the selection.
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const ACCENT = '#c2410c';

export function createHighlighter(scene, { fill = false } = {}) {
  const layer = new THREE.Group();
  layer.name = fill ? 'preview-highlight' : 'highlight';
  scene.add(layer);
  const material = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
  const tint = fill ? new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }) : null;

  const outline = (geometry, position) => {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
    lines.position.copy(position);
    lines.renderOrder = 10;
    layer.add(lines);
    if (tint) {
      const shade = new THREE.Mesh(geometry.clone(), tint);
      shade.position.copy(position);
      shade.renderOrder = 9;
      layer.add(shade);
    }
  };

  const clear = () => {
    layer.children.forEach((child) => child.geometry.dispose());
    layer.clear();
  };

  const draw = (group, design, selection) => {
    if (selection.kind === 'compartment') {
      const frame = frameOf(design);
      const index = design.compartments.findIndex((c) => c.id === selection.id);
      const [x0, x1] = frame.ranges[index];
      const geometry = new THREE.BoxGeometry(toM(x1 - x0), toM(frame.innerHeight), toM(frame.innerDepth));
      outline(geometry, new THREE.Vector3(toM((x0 + x1) / 2), toM(frame.panel + frame.innerHeight / 2), toM(frame.innerCenterZ)));
      geometry.dispose();
      return;
    }
    group.children
      .filter((mesh) => mesh.userData.componentId === selection.id)
      .forEach((mesh) => outline(mesh.geometry, mesh.position));
  };

  return {
    update(group, design, selection) {
      this.show(group, design, selection ? [selection] : []);
    },
    /** Outline several components at once (resolved selections: { id, kind }). */
    show(group, design, selections) {
      clear();
      if (!group) return;
      selections.forEach((selection) => draw(group, design, selection));
    },
    dispose() {
      clear();
      material.dispose();
      tint?.dispose();
    },
  };
}
