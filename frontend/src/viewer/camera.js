// Pure camera maths (no DOM, no WebGL): fit distance, named views and pose blending.
// Inputs are integer millimetres; poses are in metres.
import * as THREE from 'three';
import { toM } from './units.js';

const unit = ([x, y, z]) => {
  const length = Math.hypot(x, y, z);
  return Object.freeze([x / length, y / length, z / length]);
};

/** Unit directions from the wardrobe centre towards the camera. */
export const VIEWS = Object.freeze({
  threeQuarter: unit([0.35, 0.12, 1]),
  front: unit([0, 0.08, 1]),
  side: unit([1, 0.1, 0.12]),
});

/** Distance (m) at which the bounding sphere of the box fits both FOV axes. */
export function fitDistance({ width, height, depth }, fovDeg, aspect, margin = 1.05) {
  const radius = 0.5 * Math.hypot(toM(width), toM(height), toM(depth));
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vfov = THREE.MathUtils.degToRad(fovDeg);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * safeAspect);
  return (radius / Math.sin(Math.min(vfov, hfov) / 2)) * margin;
}

export const centerOf = ({ width, height, depth }) => [toM(width / 2), toM(height / 2), toM(-depth / 2)];

/** Pose looking at the wardrobe centre from `direction` (unit vector) at the fit distance. */
export function poseAlong(dimensions, direction, fovDeg, aspect) {
  const target = centerOf(dimensions);
  const distance = fitDistance(dimensions, fovDeg, aspect);
  return { position: target.map((value, i) => value + direction[i] * distance), target };
}

/** Pose for a named view, or null for an unknown name. */
export function poseFor(design, viewName, fovDeg, aspect) {
  if (!Object.hasOwn(VIEWS, viewName)) return null;
  return poseAlong(design.dimensions, VIEWS[viewName], fovDeg, aspect);
}

export const easeInOut = (t) => t * t * (3 - 2 * t);

/** Pose between two poses: the target moves linearly, the camera orbits it at a blended distance. */
export function blendPose(from, to, t) {
  const fromTarget = new THREE.Vector3(...from.target);
  const toTarget = new THREE.Vector3(...to.target);
  const a = new THREE.Vector3(...from.position).sub(fromTarget);
  const b = new THREE.Vector3(...to.position).sub(toTarget);
  const distance = a.length() + (b.length() - a.length()) * t;
  const turn = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
  const offset = a.normalize().applyQuaternion(new THREE.Quaternion().slerp(turn, t)).multiplyScalar(distance);
  const target = fromTarget.lerp(toTarget, t);
  return { position: target.clone().add(offset).toArray(), target: target.toArray() };
}
