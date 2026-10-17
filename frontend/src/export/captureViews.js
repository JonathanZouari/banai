// Renders still images of the committed design for the carpenter's PDF. It uses its own offscreen
// renderer and scene, so the interactive viewer (camera, selection, labels) is never touched.
import * as THREE from 'three';
import { buildWardrobe, disposeWardrobe } from '../viewer/buildWardrobe.js';
import { createMaterials } from '../viewer/materials.js';
import { toM } from '../viewer/units.js';
import { createScene } from '../viewer/viewer.js';

const FOV = 32;

/** Camera placement: `azimuth` and `elevation` in degrees around the wardrobe's centre (0, 0 = straight on). */
function placeCamera(camera, design, aspect, azimuth, elevation) {
  const { width, height, depth } = design.dimensions;
  const center = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
  const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distance = (Math.max(toM(height), toM(width) / aspect) / (2 * half)) * 1.08 + toM(depth) / 4;
  const az = THREE.MathUtils.degToRad(azimuth);
  const el = THREE.MathUtils.degToRad(elevation);
  camera.position.set(
    center.x + distance * Math.sin(az) * Math.cos(el),
    center.y + distance * Math.sin(el),
    center.z + distance * Math.cos(az) * Math.cos(el),
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

/** The views, in the order they appear in the PDF. A wardrobe without doors needs no separate interior view. */
export function viewsFor(design) {
  const hasDoors = design.doors.type !== 'none';
  return [
    { id: 'perspective', title: hasDoors ? 'Perspective view (doors closed)' : 'Perspective view', doors: true, azimuth: 32, elevation: 12 },
    { id: 'front', title: hasDoors ? 'Front view (doors closed)' : 'Front view', doors: true, azimuth: 0, elevation: 0 },
    ...(hasDoors ? [{ id: 'interior', title: 'Interior view (doors hidden)', doors: false, azimuth: 24, elevation: 8 }] : []),
  ];
}

/** Returns [{ id, title, dataUrl, width, height }] as JPEG data URLs on a white background. */
export function captureViews(design, catalog, { width = 1100, height = 825 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shots = [];
  let materials = null;
  try {
    const scene = createScene({ background: '#ffffff', grid: false });
    materials = createMaterials(catalog);
    const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.05, 60);
    viewsFor(design).forEach((view) => {
      const group = buildWardrobe(design, materials, { doorsVisible: view.doors });
      scene.add(group);
      placeCamera(camera, design, width / height, view.azimuth, view.elevation);
      renderer.render(scene, camera);
      shots.push({ id: view.id, title: view.title, dataUrl: renderer.domElement.toDataURL('image/jpeg', 0.9), width, height });
      scene.remove(group);
      disposeWardrobe(group);
    });
  } finally {
    materials?.dispose();
    renderer.dispose();
    renderer.forceContextLoss(); // release the GPU context now, not whenever the garbage collector runs
  }
  return shots;
}
