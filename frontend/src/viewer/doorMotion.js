// Door opening poses for the "Show interior" transition. Hinged doors swing outwards
// around their hinge edge; sliding panels slide aside. `amount` is 0 (closed) .. 1 (open).
import * as THREE from 'three';

const SWING = THREE.MathUtils.degToRad(105);
const SLIDE_OUT = 0.05; // m, how far a sliding panel comes forward before sliding

/** Rest transform of a door mesh, captured before it is animated. */
export const restOf = (mesh) => ({ x: mesh.position.x, z: mesh.position.z, ry: mesh.rotation.y });

export function poseDoor(mesh, rest, amount, centerX) {
  const width = mesh.geometry.parameters.width;
  const { hingeSide } = mesh.userData;
  if (hingeSide === 'left' || hingeSide === 'right') {
    // Rotate the door about a vertical axis on its hinge edge (outwards, towards +z).
    const offset = hingeSide === 'left' ? width / 2 : -width / 2;
    const angle = (hingeSide === 'left' ? -SWING : SWING) * amount;
    mesh.position.x = rest.x - offset + offset * Math.cos(angle);
    mesh.position.z = rest.z - offset * Math.sin(angle);
    mesh.rotation.y = rest.ry + angle;
    return;
  }
  // Sliding panel: come forward, then glide towards the nearer side.
  const forward = Math.min(amount / 0.35, 1);
  const glide = Math.max((amount - 0.35) / 0.65, 0);
  const direction = rest.x < centerX ? -1 : 1;
  mesh.position.z = rest.z + SLIDE_OUT * forward;
  mesh.position.x = rest.x + direction * width * 0.9 * glide;
}

/**
 * A detached, independently disposable copy of a door used to animate it away after the
 * real meshes are gone (it is never pickable and never part of the wardrobe group).
 */
export function ghostOf(mesh, edgeMaterial) {
  const material = mesh.material.clone();
  material.transparent = true;
  const ghost = new THREE.Mesh(mesh.geometry.clone(), material);
  ghost.position.copy(mesh.position);
  ghost.rotation.copy(mesh.rotation);
  ghost.userData = { ...mesh.userData };
  ghost.castShadow = true;
  ghost.raycast = () => {};
  const edgeMat = edgeMaterial.clone();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry, 30), edgeMat);
  edges.raycast = () => {};
  ghost.add(edges);
  return {
    mesh: ghost,
    setOpacity(opacity) {
      material.opacity = opacity;
      edgeMat.opacity = edgeMaterial.opacity * opacity;
      material.depthWrite = opacity > 0.98;
    },
    dispose() {
      ghost.geometry.dispose();
      edges.geometry.dispose();
      material.dispose();
      edgeMat.dispose();
    },
  };
}
