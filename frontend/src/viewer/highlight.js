// Selection feedback: an always-on-top outline around the selected component.
// Compartments have no mesh of their own, so their interior volume is outlined.
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const ACCENT = '#c2410c';

export function createHighlighter(scene) {
  const layer = new THREE.Group();
  layer.name = 'highlight';
  scene.add(layer);
  const material = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });

  const outline = (geometry, position, source = null) => {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
    lines.position.copy(position);
    if (source) lines.quaternion.copy(source.quaternion);
    lines.userData.source = source; // a moving mesh (an opening door) is followed every frame
    lines.renderOrder = 10;
    layer.add(lines);
  };

  const clear = () => {
    layer.children.forEach((child) => child.geometry.dispose());
    layer.clear();
  };

  return {
    update(group, design, selection) {
      clear();
      if (!group || !selection) return;
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
        .forEach((mesh) => outline(mesh.geometry, mesh.position, mesh));
    },
    /** Keep outlines on meshes that moved since update() (doors opening or closing). */
    follow() {
      layer.children.forEach((lines) => {
        const { source } = lines.userData;
        if (!source) return;
        lines.position.copy(source.position);
        lines.quaternion.copy(source.quaternion);
      });
    },
    dispose() {
      clear();
      material.dispose();
    },
  };
}
