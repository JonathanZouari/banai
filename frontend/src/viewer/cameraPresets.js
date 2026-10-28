import * as THREE from 'three';
import { toM } from './units.js';

const DURATION = 550;

function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }

function animateTo(camera, controls, toPos, toTarget) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();

  if (reduced) {
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    controls.update();
    return;
  }

  const start = performance.now();
  function step(now) {
    const t = easeOut3(Math.min((now - start) / DURATION, 1));
    camera.position.lerpVectors(fromPos, toPos, t);
    controls.target.lerpVectors(fromTarget, toTarget, t);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function center(design) {
  const { width, height, depth } = design.dimensions;
  return new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
}

function orbitDist(camera, design) {
  const { width, height } = design.dimensions;
  return (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.35;
}

export function createCameraPresets(camera, controls) {
  let design = null;

  return {
    setDesign(d) { design = d; },

    front() {
      if (!design) return;
      const c = center(design);
      const d = orbitDist(camera, design);
      animateTo(camera, controls, new THREE.Vector3(c.x, c.y, c.z + d), c);
    },

    side() {
      if (!design) return;
      const c = center(design);
      const d = orbitDist(camera, design);
      animateTo(camera, controls, new THREE.Vector3(c.x + d, c.y, c.z), c);
    },

    quarter() {
      if (!design) return;
      const c = center(design);
      const d = orbitDist(camera, design);
      animateTo(camera, controls,
        new THREE.Vector3(c.x + d * 0.35, c.y + d * 0.12, d),
        c,
      );
    },

    reset() {
      if (!design) return;
      const c = center(design);
      const d = orbitDist(camera, design);
      animateTo(camera, controls,
        new THREE.Vector3(c.x + d * 0.35, c.y + d * 0.12, d),
        c,
      );
    },
  };
}

export function mountCameraToolbar(container, presets) {
  const toolbar = document.createElement('div');
  toolbar.className = 'cam-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Camera angle presets');

  const buttons = [
    { key: 'front',   label: 'חזית' },
    { key: 'side',    label: 'צד'   },
    { key: 'quarter', label: '¾'    },
    { key: 'reset',   label: '⟳'   },
  ];

  for (const { key, label } of buttons) {
    const btn = document.createElement('button');
    btn.className = 'cam-btn';
    btn.textContent = label;
    btn.title = key === 'reset' ? 'Reset camera' : `${label} view`;
    btn.addEventListener('click', () => presets[key]());
    toolbar.appendChild(btn);
  }

  container.appendChild(toolbar);
  return toolbar;
}
