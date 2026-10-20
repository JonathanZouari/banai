// Stretch handles and the ghost that previews a new size (ADR-039, stage 2). The handles come from
// resizeRules.handlesFor: small discs that face the camera and are drawn over everything, so an edge behind a
// door can still be grabbed. The ghost is a translucent box with outlined edges. Visual only: hidden in renders
// and video with the other overlays.
import * as THREE from 'three';
import { toM } from './units.js';

const HANDLE_MM = 34; // the disc's diameter at 1 m; it scales with distance like any object
const WALL_HANDLE_MM = 60;

export function createHandles(scene) {
  const group = new THREE.Group();
  group.name = 'handles';
  scene.add(group);
  const fill = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.96, toneMapped: false });
  const ring = new THREE.MeshBasicMaterial({ color: '#0071e3', depthTest: false, transparent: true, toneMapped: false });
  const wallFill = new THREE.MeshBasicMaterial({ color: '#f6efe4', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
  const wallRing = new THREE.MeshBasicMaterial({ color: '#8a7f73', depthTest: false, transparent: true, toneMapped: false });
  const disc = new THREE.CircleGeometry(0.5, 24);
  const outline = new THREE.RingGeometry(0.5, 0.64, 24);
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#0071e3', transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false });
  const ghostEdges = new THREE.LineBasicMaterial({ color: '#0071e3', toneMapped: false });
  let ghost = null;

  const clear = () => {
    group.children.slice().forEach((child) => group.remove(child));
  };

  return {
    group,
    /** Show `handles` ([{ key, owner, edge, at }]); each disc carries userData.handle. */
    update(handles) {
      clear();
      handles.forEach((handle) => {
        const wall = handle.owner.kind === 'wall';
        const size = toM(wall ? WALL_HANDLE_MM : HANDLE_MM);
        const item = new THREE.Group();
        item.add(new THREE.Mesh(outline, wall ? wallRing : ring), new THREE.Mesh(disc, wall ? wallFill : fill));
        item.scale.setScalar(size);
        item.position.set(toM(handle.at[0]), toM(handle.at[1]), toM(handle.at[2]));
        item.renderOrder = 10;
        item.children.forEach((c) => { c.renderOrder = 10; });
        item.userData.handle = handle;
        item.name = `handle-${handle.key}`;
        group.add(item);
      });
    },
    /** Turn every disc to the camera (call before each frame). */
    face(camera) {
      group.children.forEach((item) => item.quaternion.copy(camera.quaternion));
    },
    /** The handle under a ray, nearest first, or null. */
    hit(raycaster) {
      group.updateMatrixWorld();
      const [first] = raycaster.intersectObjects(group.children, true);
      let node = first?.object ?? null;
      while (node && !node.userData.handle) node = node.parent;
      return node ? { handle: node.userData.handle, point: first.point.clone(), object: node } : null;
    },
    /** A translucent box from `box.min` to `box.max` (mm), or none. */
    ghost(box) {
      if (ghost) {
        group.parent?.remove(ghost);
        ghost.geometry.dispose();
        ghost.children.forEach((c) => c.geometry.dispose());
        ghost = null;
      }
      if (!box) return;
      const size = [0, 1, 2].map((i) => Math.max(1, box.max[i] - box.min[i]));
      const geometry = new THREE.BoxGeometry(toM(size[0]), toM(size[1]), toM(size[2]));
      ghost = new THREE.Mesh(geometry, ghostMaterial);
      ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), ghostEdges));
      ghost.position.set(...[0, 1, 2].map((i) => toM((box.min[i] + box.max[i]) / 2)));
      ghost.renderOrder = 9;
      ghost.name = 'resize-ghost';
      scene.add(ghost);
    },
    setVisible(on) {
      group.visible = on;
      if (ghost) ghost.visible = on;
    },
    dispose() {
      this.ghost(null);
      clear();
      scene.remove(group);
      [fill, ring, wallFill, wallRing, ghostMaterial, ghostEdges].forEach((m) => m.dispose());
      disc.dispose();
      outline.dispose();
    },
  };
}
