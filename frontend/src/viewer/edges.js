// Thin panel edge lines. Each wardrobe mesh gets a LineSegments child that shares ONE
// material owned by the viewer, so the lines can come and go with the wardrobe without
// touching `group.children` (picking, highlighting and the builders rely on it being the
// component meshes only).
import * as THREE from 'three';

const EDGE_ANGLE_DEG = 30; // only real corners, not the facets of the rail cylinder

const noRaycast = () => {};

/** Add an edge-line child to every mesh in the group; `material` stays owned by the caller. */
export function attachEdges(group, material) {
  group.children.forEach((mesh) => {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE_DEG), material);
    edges.userData.edge = true;
    edges.raycast = noRaycast;
    mesh.add(edges);
  });
}

/** Remove the edge lines and free their geometry (never the shared material). */
export function detachEdges(group) {
  group.children.forEach((mesh) => {
    mesh.children
      .filter((child) => child.userData.edge)
      .forEach((edges) => {
        mesh.remove(edges);
        edges.geometry.dispose();
      });
  });
}
