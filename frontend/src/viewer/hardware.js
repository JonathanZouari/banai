// Shared handle / mirror materials. One material per finish; the viewer owns and disposes them.
import * as THREE from 'three';

export function createHardware() {
  const finishes = {
    steel: new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 1, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.6, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 1, roughness: 0.3 }),
  };
  const mirror = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.03, color: '#f4f6f8' });
  return {
    handle: (finish) => finishes[finish] ?? finishes.steel,
    mirror,
    dispose() {
      Object.values(finishes).forEach((material) => material.dispose());
      mirror.dispose();
    },
  };
}
