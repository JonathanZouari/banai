// Derived frame measurements (mm) shared by the builders, plus a box-mesh helper.
// Coordinates: x = 0 at the outer left face, y = 0 at the floor, the front face at
// z = 0 and the back at z = -depth.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { compartmentXRanges, interiorHeight, interiorWidth } from '../../domain/geometry.js';
import { VISUAL, toM } from '../units.js';

export function frameOf(design) {
  const { width, height, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerDepth = depth - VISUAL.backThickness;
  return {
    width, height, depth, panel, innerDepth,
    innerWidth: interiorWidth(design),
    innerHeight: interiorHeight(design),
    // Interior x-range of each compartment, shifted to outer coordinates.
    ranges: compartmentXRanges(design).map(([x0, x1]) => [panel + x0, panel + x1]),
    innerCenterZ: -innerDepth / 2,
  };
}

/**
 * Scale UVs so one texture repeat covers the same real-world area on every panel, with the
 * grain (texture v) along the longest side of each face. Without this a texture would stretch
 * differently on a 2 m door and a 60 cm shelf.
 */
function worldScaleUVs(geometry, center) {
  const { position, normal, uv } = geometry.attributes;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const tile = toM(VISUAL.woodTileSize);
  const axes = ['x', 'y', 'z'];
  const point = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < uv.count; i += 1) {
    n.fromBufferAttribute(normal, i);
    // World position: neighbouring panels continue the pattern instead of repeating it.
    point.fromBufferAttribute(position, i).add(center);
    // The face plane is spanned by the two axes other than the dominant normal axis.
    const facing = axes.reduce((best, axis) => (Math.abs(n[axis]) > Math.abs(n[best]) ? axis : best), 'x');
    const [a, b] = axes.filter((axis) => axis !== facing);
    const [across, along] = size[a] >= size[b] ? [b, a] : [a, b];
    uv.setXY(i, point[across] / tile, point[along] / tile);
  }
  uv.needsUpdate = true;
}

/** A box mesh from a size and centre given in millimetres. `rounded` softens the edges. */
export function box({ size: [w, h, d], center: [x, y, z], material, userData, rounded = false }) {
  const [wm, hm, dm] = [toM(w), toM(h), toM(d)];
  const radius = Math.min(toM(VISUAL.edgeRadius), wm / 2, hm / 2, dm / 2) * 0.999;
  const geometry = rounded && radius > 0
    ? new RoundedBoxGeometry(wm, hm, dm, 2, radius)
    : new THREE.BoxGeometry(wm, hm, dm);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(toM(x), toM(y), toM(z));
  worldScaleUVs(geometry, mesh.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { ...userData };
  return mesh;
}
