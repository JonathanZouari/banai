// Selection and hover feedback. Selection: an always-on-top accent outline plus a
// translucent fill. Hover: a lighter outline only. Compartments have no mesh of their
// own, so their interior volume is used. Overlays live in their own layers (never in the
// wardrobe group) and are never raycast targets.
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const ACCENT = '#0071e3';

const noRaycast = () => {};

export function createHighlighter(scene) {
  const selectionLayer = new THREE.Group();
  selectionLayer.name = 'highlight';
  const hoverLayer = new THREE.Group();
  hoverLayer.name = 'hover';
  scene.add(selectionLayer, hoverLayer);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, toneMapped: false });
  const hoverMaterial = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.45, toneMapped: false });
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });

  /** Outline (and optionally a fill) for one geometry placed like `transform`. */
  const addShape = (layer, geometry, transform, { lines, fill }, owned = false) => {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lines);
    edges.renderOrder = 10;
    edges.raycast = noRaycast;
    edges.position.copy(transform.position);
    if (transform.quaternion) edges.quaternion.copy(transform.quaternion);
    if (transform.scale) edges.scale.copy(transform.scale);
    layer.add(edges);
    if (!fill) {
      if (owned) geometry.dispose();
      return;
    }
    // A fill over a wardrobe mesh borrows its geometry (disposed with the wardrobe); an owned one is freed on clear.
    const overlay = new THREE.Mesh(geometry, fill);
    overlay.renderOrder = 9;
    overlay.raycast = noRaycast;
    overlay.userData.sharedGeometry = !owned;
    overlay.position.copy(transform.position);
    if (transform.quaternion) overlay.quaternion.copy(transform.quaternion);
    if (transform.scale) overlay.scale.copy(transform.scale);
    layer.add(overlay);
  };

  const clearLayer = (layer) => {
    layer.children.forEach((child) => {
      if (!child.userData.sharedGeometry) child.geometry.dispose();
    });
    layer.clear();
  };

  const fill = (layer, group, design, target, style) => {
    if (!group || !target) return;
    if (target.kind === 'compartment') {
      const frame = frameOf(design);
      const index = design.compartments.findIndex((c) => c.id === target.id);
      if (index < 0) return;
      const [x0, x1] = frame.ranges[index];
      const geometry = new THREE.BoxGeometry(toM(x1 - x0), toM(frame.innerHeight), toM(frame.innerDepth));
      const position = new THREE.Vector3(toM((x0 + x1) / 2), toM(frame.panel + frame.innerHeight / 2), toM(frame.innerCenterZ));
      addShape(layer, geometry, { position }, style, true);
      return;
    }
    group.children
      .filter((mesh) => mesh.userData.componentId === target.id)
      .forEach((mesh) => addShape(layer, mesh.geometry, mesh, style));
  };

  return {
    update(group, design, selection) {
      clearLayer(selectionLayer);
      fill(selectionLayer, group, design, selection, { lines: outlineMaterial, fill: fillMaterial });
    },
    /** Hover outline for a component id (null clears). Callers skip the selected id. */
    setHover(group, design, id) {
      clearLayer(hoverLayer);
      if (!id || !group) return;
      const kind = design.compartments.some((c) => c.id === id)
        ? 'compartment'
        : group.children.find((mesh) => mesh.userData.componentId === id)?.userData.kind;
      if (!kind) return;
      fill(hoverLayer, group, design, { id, kind }, { lines: hoverMaterial, fill: null });
    },
    /** Hide/show both overlay layers (hidden while doors animate, since overlays copy the mesh's transform). */
    setVisible(visible) {
      selectionLayer.visible = visible;
      hoverLayer.visible = visible;
    },
    dispose() {
      clearLayer(selectionLayer);
      clearLayer(hoverLayer);
      outlineMaterial.dispose();
      hoverMaterial.dispose();
      fillMaterial.dispose();
    },
  };
}
