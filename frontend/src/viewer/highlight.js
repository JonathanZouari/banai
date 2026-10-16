// Selection feedback: an always-on-top outline around the selected component, gently
// pulsing, plus a fainter outline for the component under the pointer. Outlines follow
// their mesh every frame, so they stay attached while doors swing or parts glide.
// Compartments have no mesh of their own, so their interior volume is outlined.
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const ACCENT = '#c2410c';
const PULSE_MS = 1600;

const reducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function createLayer(scene, name, material) {
  const layer = new THREE.Group();
  layer.name = name;
  scene.add(layer);
  let tracked = [];

  const outline = (geometry, position, mesh = null) => {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
    lines.position.copy(position);
    if (mesh) lines.rotation.copy(mesh.rotation);
    lines.renderOrder = 10;
    lines.raycast = () => {};
    layer.add(lines);
    if (mesh) tracked.push({ lines, mesh });
  };

  const clear = () => {
    layer.children.forEach((child) => child.geometry.dispose());
    layer.clear();
    tracked = [];
  };

  return {
    show(group, design, id, kind) {
      clear();
      if (!group || !id) return;
      if (kind === 'compartment') {
        const frame = frameOf(design);
        const index = design.compartments.findIndex((c) => c.id === id);
        if (index < 0) return;
        const [x0, x1] = frame.ranges[index];
        const geometry = new THREE.BoxGeometry(toM(x1 - x0), toM(frame.innerHeight), toM(frame.innerDepth));
        outline(geometry, new THREE.Vector3(toM((x0 + x1) / 2), toM(frame.panel + frame.innerHeight / 2), toM(frame.innerCenterZ)));
        geometry.dispose();
        return;
      }
      group.children
        .filter((mesh) => mesh.userData.componentId === id)
        .forEach((mesh) => outline(mesh.geometry, mesh.position, mesh));
    },
    follow() {
      tracked.forEach(({ lines, mesh }) => {
        lines.position.copy(mesh.position);
        lines.rotation.copy(mesh.rotation);
        lines.scale.copy(mesh.scale);
      });
    },
    clear,
  };
}

export function createHighlighter(scene) {
  const selectMaterial = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
  const hoverMaterial = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.35 });
  const selected = createLayer(scene, 'highlight', selectMaterial);
  const hovered = createLayer(scene, 'hover', hoverMaterial);
  let hoverId = null;

  return {
    update(group, design, selection) {
      selected.show(group, design, selection?.id, selection?.kind);
      // The selected part never also shows the hover outline.
      if (selection && selection.id === hoverId) {
        hovered.clear();
        hoverId = null;
      }
    },
    hover(group, design, id) {
      if (id === hoverId) return;
      hoverId = id;
      const kind = design?.compartments.some((c) => c.id === id) ? 'compartment' : null;
      hovered.show(group, design, id, kind);
    },
    tick(time = 0) {
      selected.follow();
      hovered.follow();
      selectMaterial.opacity = reducedMotion() ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * Math.cos((time / PULSE_MS) * Math.PI * 2));
    },
    dispose() {
      selected.clear();
      hovered.clear();
      selectMaterial.dispose();
      hoverMaterial.dispose();
    },
  };
}
