// A bright Scandinavian room for the landing story: oak floor, plaster walls, a tall window,
// a bench, a rug, a plant and a print. Procedural (no image files), and purely decorative.
import * as THREE from 'three';

/** Deterministic pseudo-random numbers, so the room looks the same on every visit. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

/** Light oak planks with grain and staggered joints. */
function floorCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const random = seeded(5);
  const rows = 8;
  const rowHeight = canvas.height / rows;
  for (let row = 0; row < rows; row += 1) {
    let x = -random() * 700;
    while (x < canvas.width) {
      const length = 520 + random() * 520;
      const tone = 0.92 + random() * 0.12;
      ctx.fillStyle = `rgb(${Math.round(218 * tone)}, ${Math.round(188 * tone)}, ${Math.round(148 * tone)})`;
      ctx.fillRect(x, row * rowHeight, length, rowHeight);
      for (let i = 0; i < 26; i += 1) {
        const y0 = row * rowHeight + random() * rowHeight;
        const sway = 1 + random() * 4;
        const frequency = 0.004 + random() * 0.01;
        const phase = random() * 6;
        ctx.strokeStyle = `rgba(110, 72, 38, ${0.03 + random() * 0.08})`;
        ctx.lineWidth = 0.6 + random() * 1.8;
        ctx.beginPath();
        for (let px = x; px <= x + length; px += 18) {
          const py = y0 + Math.sin(px * frequency + phase) * sway;
          if (px === x) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80, 52, 30, 0.28)';
      ctx.fillRect(x, row * rowHeight, 2, rowHeight);
      x += length;
    }
    ctx.fillStyle = 'rgba(80, 52, 30, 0.32)';
    ctx.fillRect(0, row * rowHeight, canvas.width, 2);
  }
  return canvas;
}

/** A fine vertical grain for the oak furniture. */
function grainCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = seeded(11);
  ctx.fillStyle = '#d4ab7e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 60; i += 1) {
    const x0 = random() * canvas.width;
    const sway = 2 + random() * 6;
    const phase = random() * 6;
    ctx.strokeStyle = `rgba(90, 55, 25, ${0.05 + random() * 0.1})`;
    ctx.lineWidth = 0.6 + random() * 1.6;
    ctx.beginPath();
    for (let y = 0; y <= canvas.height; y += 16) {
      const x = x0 + Math.sin(y / 90 + phase) * sway;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvas;
}

/** A small abstract print: sun, field and a line, in the app's palette. */
function printCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4efe7';
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = '#d98b62';
  ctx.beginPath();
  ctx.arc(128, 150, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7d8c6a';
  ctx.fillRect(40, 220, 176, 80);
  ctx.fillStyle = '#2f3e55';
  ctx.fillRect(40, 300, 176, 10);
  return canvas;
}

/**
 * The room around a wardrobe that stands against the back wall at z = -0.3 m.
 * `props` are the loose objects that settle into place as the camera pulls back.
 */
export function createRoom() {
  const group = new THREE.Group();
  const props = [];
  const add = (mesh, parent = group, { cast = true, receive = true } = {}) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  };

  const floor = add(new THREE.Mesh(
    new THREE.PlaneGeometry(9, 7),
    new THREE.MeshStandardMaterial({ map: canvasTexture(floorCanvas(), 6, 4.5), roughness: 0.5, envMapIntensity: 0.6 }),
  ), group, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 2.2;

  const plaster = new THREE.MeshStandardMaterial({ color: '#efeae3', roughness: 0.95, envMapIntensity: 0.35 });
  const back = add(new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), plaster), group, { cast: false });
  back.position.set(0.5, 1.7, -0.31);

  // The left wall, built around a tall window opening.
  const wallX = -2.35;
  const thickness = 0.14;
  const [z0, z1, sillY, headY] = [0.35, 1.75, 0.62, 2.6];
  const wallBlock = (zs, ze, ys, ye) => {
    const block = add(new THREE.Mesh(new THREE.BoxGeometry(thickness, ye - ys, ze - zs), plaster));
    block.position.set(wallX, (ys + ye) / 2, (zs + ze) / 2);
  };
  wallBlock(-0.31, z0, 0, 3.4);
  wallBlock(z1, 5.6, 0, 3.4);
  wallBlock(z0, z1, 0, sillY);
  wallBlock(z0, z1, headY, 3.4);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#f7f5f1', roughness: 0.6 });
  const bar = (height, depth, y, z) => {
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, height, depth), frameMaterial));
    mesh.position.set(wallX + 0.02, y, z);
  };
  const midY = (sillY + headY) / 2;
  const midZ = (z0 + z1) / 2;
  bar(headY - sillY, 0.05, midY, z0 + 0.025);
  bar(headY - sillY, 0.05, midY, z1 - 0.025);
  bar(headY - sillY, 0.04, midY, midZ);
  bar(0.05, z1 - z0, sillY + 0.025, midZ);
  bar(0.05, z1 - z0, headY - 0.025, midZ);
  bar(0.04, z1 - z0, sillY + (headY - sillY) * 0.66, midZ);
  const sill = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, z1 - z0 + 0.1), frameMaterial));
  sill.position.set(wallX + 0.08, sillY - 0.015, midZ);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshBasicMaterial({ color: '#fbf6ee' }));
  sky.position.set(wallX - 1.2, 1.8, 1.1);
  sky.rotation.y = Math.PI / 2;
  group.add(sky);

  const skirting = add(new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.014), new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.7 })));
  skirting.position.set(0.5, 0.04, -0.302);

  const rug = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 1.5), new THREE.MeshStandardMaterial({ color: '#ddd3c6', roughness: 1 })), group, { cast: false });
  rug.position.set(0.1, 0.005, 1.35);
  props.push(rug);

  // An oak bench with a folded throw and a book.
  const oak = new THREE.MeshStandardMaterial({ map: canvasTexture(grainCanvas()), roughness: 0.55 });
  const bench = new THREE.Group();
  add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.34), oak), bench).position.y = 0.44;
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.43, 14), oak), bench).position.set(sx * 0.44, 0.215, sz * 0.13);
  }));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: '#bfae99', roughness: 1 })), bench).position.set(0.22, 0.483, 0);
  const book = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: '#9c4520', roughness: 0.8 })), bench);
  book.position.set(-0.25, 0.473, 0.02);
  book.rotation.y = 0.2;
  bench.position.set(-1.72, 0, 0.02);
  group.add(bench);
  props.push(bench);

  // A fiddle-leaf fig in a ceramic pot.
  const plant = new THREE.Group();
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.38, 32), new THREE.MeshStandardMaterial({ color: '#e7e1d8', roughness: 0.7 })), plant).position.y = 0.19;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.01, 24), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 })), plant).position.y = 0.37;
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 0.9 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#56723f', roughness: 0.55, side: THREE.DoubleSide });
  const leafGeometry = new THREE.SphereGeometry(1, 16, 10);
  const random = seeded(3);
  for (let s = 0; s < 3; s += 1) {
    const tilt = (s - 1) * 0.16;
    const length = 1.0 + s * 0.22;
    const stem = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, length, 8), stemMaterial), plant);
    stem.position.set((Math.sin(tilt) * length) / 2, 0.37 + length / 2, (s - 1) * 0.03);
    stem.rotation.z = -tilt;
    for (let k = 0; k < 9; k += 1) {
      const t = 0.3 + (k / 8) * 0.7;
      const azimuth = random() * Math.PI * 2;
      const size = 0.07 + random() * 0.05;
      const leaf = add(new THREE.Mesh(leafGeometry, leafMaterial), plant);
      leaf.scale.set(size * 1.25, size * 0.18, size * 0.95);
      leaf.position.set(Math.sin(tilt) * length * t + Math.cos(azimuth) * 0.09, 0.37 + length * t, (s - 1) * 0.03 + Math.sin(azimuth) * 0.09);
      leaf.rotation.set(-0.5 + random() * 0.4, -azimuth, 0.35 + random() * 0.3);
    }
  }
  plant.position.set(1.45, 0, 0.12);
  group.add(plant);
  props.push(plant);

  // A framed print beside the wardrobe.
  const print = new THREE.Group();
  add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.025), oak), print);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshStandardMaterial({ map: canvasTexture(printCanvas()), roughness: 0.9 })), print, { cast: false }).position.z = 0.014;
  print.position.set(1.65, 1.6, -0.29);
  group.add(print);
  props.push(print);

  props.forEach((prop) => { prop.userData.base = prop.position.clone(); });
  return {
    group,
    props,
    dispose() {
      group.removeFromParent();
      const materials = new Set();
      group.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) materials.add(object.material);
      });
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    },
  };
}
