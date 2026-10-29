// One WebGL stage per landing section: renderer, scene, camera and soft environment light.
// It renders only while its section is on screen, and returns null when WebGL is unavailable,
// so callers show a still fallback instead.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX_PIXEL_RATIO = 1.75;

export function createStage(slot, { exposure = 1, environment = 0.5, fov = 32 } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft via shadow.radius
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'landing-canvas';
  slot.append(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = environment;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 60);

  const stage = {
    renderer, scene, camera, canvas, slot,
    visible: false,
    width: 1,
    height: 1,
    resize() {
      stage.width = slot.clientWidth || 1;
      stage.height = slot.clientHeight || 1;
      renderer.setSize(stage.width, stage.height, false);
      camera.aspect = stage.width / stage.height;
      camera.updateProjectionMatrix();
    },
    /** Orbit the camera around a target: azimuth and elevation in radians, distance in metres. */
    look(target, azimuth, elevation, distance) {
      camera.position.set(
        target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
        target.y + Math.sin(elevation) * distance,
        target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      camera.lookAt(target);
    },
    /** Shift the framed subject sideways (fraction of the width) and vertically (fraction of the height). */
    shift(x = 0, y = 0) {
      camera.setViewOffset(stage.width, stage.height, -x * stage.width, -y * stage.height, stage.width, stage.height);
    },
    /** Distance that fits a width × height box (metres) in view, with a margin. */
    fit(width, height, margin = 1.15) {
      const vertical = THREE.MathUtils.degToRad(camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      return Math.max((height * margin) / (2 * Math.tan(vertical / 2)), (width * margin) / (2 * Math.tan(horizontal / 2)));
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      resizeObserver.disconnect();
      visibility.disconnect();
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  const resizeObserver = new ResizeObserver(() => stage.resize());
  resizeObserver.observe(slot);
  const visibility = new IntersectionObserver(([entry]) => { stage.visible = entry.isIntersecting; });
  visibility.observe(slot);
  stage.resize();
  return stage;
}

/** A soft sun with wide, blurred shadows. */
export function addSun(scene, { position, target, intensity, reach = 3.5, color = '#fff3e3' }) {
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.position.copy(position);
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 20 });
  scene.add(sun, sun.target);
  return sun;
}

/** A floor that only shows the shadows falling on it. */
export function addShadowFloor(scene, opacity = 0.14) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}
