// Appearance -> three.js material, with a cache per distinct appearance.
// Catalog data stays outside the renderer: colours come from the injected catalog.
import * as THREE from 'three';

// ASSUMPTION: prototype visual mapping, not a material specification.
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.85, satin: 0.5, gloss: 0.15 });
const DEFAULT_ROUGHNESS = 0.6;
const FALLBACK_COLOR = '#b8b8b8';

function resolveColor(ref, catalog) {
  if (ref.custom) return ref.hex ?? FALLBACK_COLOR;
  return catalog.colors.find((c) => c.id === ref.catalogId)?.hex ?? FALLBACK_COLOR;
}

export const MIRROR_ID = 'mirror'; // catalog material rendered as reflective glass
export const isMirror = (appearance) => !appearance.material.custom && appearance.material.catalogId === MIRROR_ID;

const resolveRoughness = (ref) => (ref.custom ? DEFAULT_ROUGHNESS : FINISH_ROUGHNESS[ref.catalogId] ?? DEFAULT_ROUGHNESS);

export function createMaterials(catalog) {
  const cache = new Map();
  let envMap = null; // reflection of the room, provided by the viewer
  const rail = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.8, roughness: 0.3 });
  // Door handles and sliding rails: neutral dark metal, independent of the design's appearance.
  const hardware = new THREE.MeshStandardMaterial({ color: '#4a4e53', metalness: 0.6, roughness: 0.4 });
  // Thin outline on door panels so adjacent white panels stay readable.
  const doorEdge = new THREE.LineBasicMaterial({ color: '#3b3530', transparent: true, opacity: 0.38 });

  return {
    forAppearance(appearance) {
      const key = JSON.stringify(appearance);
      if (!cache.has(key) && isMirror(appearance)) {
        // ASSUMPTION: visual approximation of mirror glass (slightly cool, near-perfect gloss).
        const mirror = new THREE.MeshStandardMaterial({ color: '#e9eef1', metalness: 1, roughness: 0.03, envMap, envMapIntensity: 1 });
        mirror.userData.mirror = true;
        cache.set(key, mirror);
      }
      if (!cache.has(key)) {
        cache.set(key, new THREE.MeshStandardMaterial({
          color: resolveColor(appearance.color, catalog),
          roughness: resolveRoughness(appearance.finish),
          metalness: 0,
        }));
      }
      return cache.get(key);
    },
    rail,
    hardware,
    doorEdge,
    /** Reflection texture for mirror materials (current and future). */
    setEnvMap(texture) {
      envMap = texture;
      cache.forEach((material) => {
        if (material.userData.mirror) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      });
    },
    /** Dispose cached materials the current scene no longer uses (keeps memory bounded). */
    retainOnly(inUse) {
      for (const [key, material] of cache) {
        if (!inUse.has(material)) {
          material.dispose();
          cache.delete(key);
        }
      }
    },
    dispose() {
      cache.forEach((material) => material.dispose());
      cache.clear();
      rail.dispose();
      hardware.dispose();
      doorEdge.dispose();
    },
  };
}
