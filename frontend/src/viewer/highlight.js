// Selection and hover feedback. Selection: an always-on-top accent outline plus a
// translucent fill. Hover: a lighter outline only. Compartments have no mesh of their
// own, so their interior volume is used. Overlays live in their own layers (never in the
// wardrobe group) and are never raycast targets.
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const ACCENT = '#0071e3';

const noRaycast = () => {};

/** Interior volume of compartment `index` (between its partitions) as a Box3 in metres; null for a bad index. */
export function compartmentBox(design, index) {
  const frame = frameOf(design);
  const range = Number.isInteger(index) ? frame.ranges[index] : undefined;
  if (!range) return null;
  return new THREE.Box3(
    new THREE.Vector3(toM(range[0]), toM(frame.baseY), toM(frame.innerBack)),
    new THREE.Vector3(toM(range[1]), toM(frame.baseY + frame.innerHeight), toM(frame.partitionFront)),
  );
}

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
      const volume = compartmentBox(design, design.compartments.findIndex((c) => c.id === target.id));
      if (!volume) return;
      const size = volume.getSize(new THREE.Vector3());
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      addShape(layer, geometry, { position: volume.getCenter(new THREE.Vector3()) }, style, true);
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
