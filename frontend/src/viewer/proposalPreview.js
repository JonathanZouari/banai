// Visual preview of a pending AI proposal. The viewer renders the proposal's PREVIEW
// design (a dry-run copy); this module only restyles that scene so the customer can see
// what would change before approving. It never touches store state.
//   added    -> translucent blue "ghost" + outline
//   modified -> amber outline
//   removed  -> faded red copy taken from the committed design + outline
import * as THREE from 'three';
import { buildWardrobe, disposeWardrobe } from './buildWardrobe.js';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

export const PREVIEW_COLORS = Object.freeze({ added: '#2f6fed', modified: '#d4930f', removed: '#d9534f' });

export function createProposalPreview(scene) {
  const layer = new THREE.Group();
  layer.name = 'proposal-preview';
  scene.add(layer);
  const ghost = {
    added: new THREE.MeshStandardMaterial({ color: PREVIEW_COLORS.added, transparent: true, opacity: 0.35, depthWrite: false }),
    removed: new THREE.MeshStandardMaterial({ color: PREVIEW_COLORS.removed, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const lines = Object.fromEntries(Object.entries(PREVIEW_COLORS).map(([key, color]) => [
    key, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }),
  ]));

  const outline = (geometry, position, kind) => {
    const segments = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lines[kind]);
    segments.position.copy(position);
    segments.renderOrder = 9;
    layer.add(segments);
  };

  const outlineSection = (design, compartmentId, kind) => {
    const frame = frameOf(design);
    const index = design.compartments.findIndex((c) => c.id === compartmentId);
    if (index < 0) return;
    const [x0, x1] = frame.ranges[index];
    const geometry = new THREE.BoxGeometry(toM(x1 - x0), toM(frame.innerHeight), toM(frame.innerDepth));
    outline(geometry, new THREE.Vector3(toM((x0 + x1) / 2), toM(frame.panel + frame.innerHeight / 2), toM(frame.innerCenterZ)), kind);
    geometry.dispose();
  };

  const clear = () => {
    layer.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    layer.clear();
  };

  return {
    /** Restyle `group` (built from proposal.previewDesign) to show the proposal's diff. */
    decorate(group, proposal, committed, materials, options) {
      clear();
      if (!group || !proposal || proposal.replaces) return;
      const { added, modified, removed } = proposal.diff;
      const addedSet = new Set(added);
      const modifiedSet = new Set(modified);
      group.children.forEach((mesh) => {
        const id = mesh.userData.componentId;
        if (addedSet.has(id)) {
          mesh.material = ghost.added;
          outline(mesh.geometry, mesh.position, 'added');
        } else if (modifiedSet.has(id) && id !== 'carcass') {
          outline(mesh.geometry, mesh.position, 'modified');
        }
      });
      proposal.previewDesign.compartments.forEach((c) => {
        if (addedSet.has(c.id)) outlineSection(proposal.previewDesign, c.id, 'added');
        else if (modifiedSet.has(c.id)) outlineSection(proposal.previewDesign, c.id, 'modified');
      });
      if (!removed.length) return;
      // Removed components only exist in the committed design: show faded copies of them.
      const removedSet = new Set(removed);
      const before = buildWardrobe(committed, materials, options);
      before.children
        .filter((mesh) => removedSet.has(mesh.userData.componentId))
        .forEach((mesh) => {
          const copy = new THREE.Mesh(mesh.geometry.clone(), ghost.removed);
          copy.position.copy(mesh.position);
          copy.userData = { ...mesh.userData, preview: 'removed' };
          layer.add(copy);
          outline(mesh.geometry, mesh.position, 'removed');
        });
      disposeWardrobe(before);
    },
    clear,
    dispose() {
      clear();
      Object.values(ghost).forEach((material) => material.dispose());
      Object.values(lines).forEach((material) => material.dispose());
    },
  };
}
